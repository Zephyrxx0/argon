import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import { createGatewayApp } from '../../src/app.js';
import { IngestLimiter, REFRESH_OVERLAP_SECONDS, refreshSince } from '../../src/services/public-ingest.js';
import type { GitHubUserService } from '../../src/services/github-user.js';
import type { ArgonGraphClient } from '@argon/graph';

const SECRET = 'test-secret-gateway-jwt-32-chars-long!';
const NOW = Math.floor(Date.now() / 1000);

describe('refreshSince', () => {
  it('rewinds the last completed job by the overlap and returns ISO', () => {
    expect(refreshSince(1_700_000_000)).toBe(new Date((1_700_000_000 - REFRESH_OVERLAP_SECONDS) * 1000).toISOString());
  });
  it('is undefined without a usable timestamp (=> first full read)', () => {
    for (const v of [undefined, null, 0, -5, 'abc', NaN]) expect(refreshSince(v)).toBeUndefined();
  });
});

describe('POST /api/v1/workspaces/:id/refresh', () => {
  interface State {
    exists: boolean;
    role: string | null;
    job: Record<string, unknown> | null;
    completedAt: number | null;
    graphMissing?: boolean;
  }
  let state: State;

  const roQuery = vi.fn(async (_ws: string, cypher: string) => {
    if (state.graphMissing) throw new Error('empty key');
    if (cypher.includes('ACCESSES')) {
      return { data: state.exists ? [{ exists: 1, role: state.role }] : [] };
    }
    if (cypher.includes("status: 'completed'")) return { data: [{ at: state.completedAt }] };
    if (cypher.includes('MATCH (j:IngestJob)')) return { data: state.job ? [state.job] : [] };
    return { data: [] };
  });
  const graphClient = { query: vi.fn(), roQuery, ping: vi.fn().mockResolvedValue(true) } as unknown as ArgonGraphClient;
  const onRefresh = vi.fn();
  const getRepository = vi.fn();
  const githubUserService = { getRepository, listUserRepositories: vi.fn() } as unknown as GitHubUserService;

  const makeApp = (limiter?: IngestLimiter) =>
    createGatewayApp({
      gatewaySecret: SECRET,
      graphClient,
      githubUserService,
      githubRouteOptions: { onRefresh, ingestLimiter: limiter },
    });

  const token = (payload: Record<string, unknown>) =>
    sign({ ...payload, exp: NOW + 600 }, SECRET, 'HS256');
  const post = async (app: ReturnType<typeof makeApp>, ws = 'pub-acme-widgets-abc123', who: Record<string, unknown> | null = { userId: 'u1', isAnonymous: false, userAccessToken: 'gho_x', login: 'alice' }) =>
    app.request(`/api/v1/workspaces/${ws}/refresh`, {
      method: 'POST',
      headers: who ? { Authorization: `Bearer ${await token(who)}` } : {},
    });

  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      exists: true,
      role: 'owner',
      job: { jobId: 'job_old', status: 'completed', progress: 1, error: null, repoUrl: 'https://github.com/acme/widgets', updatedAt: NOW - 3600 },
      completedAt: NOW - 3600,
    };
    getRepository.mockResolvedValue({ fullName: 'acme/widgets', htmlUrl: 'https://github.com/acme/widgets', private: true });
    onRefresh.mockResolvedValue(undefined);
  });

  it('requires authentication', async () => {
    expect((await post(makeApp(), 'pub-x', null)).status).toBe(401);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('rejects malformed workspace ids before touching the database', async () => {
    const res = await post(makeApp(), 'bad.id');
    expect(res.status).toBe(400);
    expect(roQuery).not.toHaveBeenCalled();
  });

  it('404 for an unknown workspace (no graph, or no workspace node)', async () => {
    state.graphMissing = true;
    expect((await post(makeApp())).status).toBe(404);
    state.graphMissing = false;
    state.exists = false;
    expect((await post(makeApp())).status).toBe(404);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it.each([
    ['a viewer', 'viewer'],
    ['a member', 'member'],
    ['someone with no access edge (e.g. a public showcase workspace)', null],
  ])('403 for %s: only the owner may re-sync', async (_label, role) => {
    state.role = role;
    const res = await post(makeApp());
    expect(res.status).toBe(403);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('409 when the workspace was never ingested', async () => {
    state.job = null;
    expect((await post(makeApp())).status).toBe(409);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('409 while an ingestion is still running, but a dead (silent) job does not block a retry', async () => {
    state.job = { ...state.job!, status: 'indexing', progress: 0.8, updatedAt: NOW - 10 };
    const busy = await post(makeApp());
    expect(busy.status).toBe(409);
    expect(((await busy.json()) as any).error).toMatch(/already running/);

    state.job = { ...state.job!, status: 'indexing', updatedAt: NOW - 10_000 };
    expect((await post(makeApp())).status).toBe(202);
  });

  it('a failed previous job can be retried', async () => {
    state.job = { ...state.job!, status: 'failed', error: 'clone failed' };
    expect((await post(makeApp())).status).toBe(202);
  });

  it('422 when the stored repository is not a github.com https URL (never clones local paths)', async () => {
    for (const repoUrl of ['file:///etc', '/home/me/repo', 'https://evil.example.com/a/b', 'https://169.254.169.254/a/b']) {
      state.job = { ...state.job!, repoUrl };
      const res = await post(makeApp());
      expect(res.status).toBe(422);
    }
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('404 when the signed-in user can no longer read the repository', async () => {
    getRepository.mockResolvedValue(null);
    const res = await post(makeApp());
    expect(res.status).toBe(404);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('429 while the user already has an ingestion slot in use', async () => {
    const limiter = new IngestLimiter(3);
    limiter.tryAcquire('u1');
    expect((await post(makeApp(limiter))).status).toBe(429);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('202: re-syncs with the stored repo URL, the owner\'s token and `since` = last completed job minus overlap', async () => {
    const res = await post(makeApp());
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({
      status: 'queued',
      workspaceId: 'pub-acme-widgets-abc123',
      repositoryFullName: 'acme/widgets',
      since: new Date((NOW - 3600 - REFRESH_OVERLAP_SECONDS) * 1000).toISOString(),
    });
    expect(body.jobId).toMatch(/^job_[0-9a-f]{8}$/);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    const params = onRefresh.mock.calls[0]![0];
    expect(params).toMatchObject({
      repoUrl: 'https://github.com/acme/widgets',
      workspaceId: 'pub-acme-widgets-abc123',
      jobId: body.jobId,
      userId: 'u1',
      userLogin: 'alice',
      accessToken: 'gho_x',
      since: body.since,
    });
    expect(getRepository).toHaveBeenCalledWith('gho_x', 'acme', 'widgets');
    expect(typeof params.release).toBe('function');
  });

  it('a guest who owns a public-repo workspace can re-sync it without a GitHub token', async () => {
    const res = await post(makeApp(), 'pub-acme-widgets-abc123', { userId: 'guest-1', isAnonymous: true });
    expect(res.status).toBe(202);
    expect(getRepository).not.toHaveBeenCalled();
    expect(onRefresh.mock.calls[0]![0].accessToken).toBeUndefined();
  });

  it('with no completed job yet (only a failed one) it reads everything: since is null', async () => {
    state.completedAt = null;
    state.job = { ...state.job!, status: 'failed' };
    const body = (await (await post(makeApp())).json()) as any;
    expect(body.since).toBeNull();
    expect(onRefresh.mock.calls[0]![0].since).toBeUndefined();
  });

  it('holds the user\'s ingestion slot until the job releases it, and frees it if starting fails', async () => {
    const limiter = new IngestLimiter(3);
    const app = makeApp(limiter);
    expect((await post(app)).status).toBe(202);
    expect(limiter.active).toBe(1);
    expect((await post(app)).status).toBe(429); // second refresh while the first runs
    onRefresh.mock.calls[0]![0].release();
    expect(limiter.active).toBe(0);

    onRefresh.mockRejectedValueOnce(new Error('boom'));
    const failed = await post(app);
    expect(failed.status).toBe(500);
    expect(limiter.active).toBe(0);
  });

  it('503 when the gateway has no graph database', async () => {
    const app = createGatewayApp({ gatewaySecret: SECRET, githubRouteOptions: { onRefresh } });
    const res = await post(app);
    expect(res.status).toBe(503);
  });
});
