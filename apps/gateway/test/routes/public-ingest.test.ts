import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import { createGatewayApp } from '../../src/app.js';
import {
  JOB_STALE_AFTER_SECONDS,
  effectiveJob,
  IngestLimiter,
  parsePublicRepoUrl,
  publicWorkspaceId,
} from '../../src/services/public-ingest.js';
import type { ArgonGraphClient } from '@argon/graph';

const SECRET = 'test-secret-gateway-jwt-32-chars-long!';

describe('parsePublicRepoUrl', () => {
  it('accepts plain github.com repo URLs and rebuilds a canonical clone URL', () => {
    expect(parsePublicRepoUrl('https://github.com/Zephyrxx0/treads')).toMatchObject({
      ok: true,
      owner: 'Zephyrxx0',
      repo: 'treads',
      url: 'https://github.com/Zephyrxx0/treads',
      fullName: 'Zephyrxx0/treads',
    });
    expect(parsePublicRepoUrl('https://www.github.com/a/b.git/')).toMatchObject({
      ok: true,
      url: 'https://github.com/a/b',
    });
  });

  it.each([
    ['', 'empty'],
    ['not a url', 'malformed'],
    ['http://github.com/a/b', 'http'],
    ['file:///etc/passwd', 'file scheme'],
    ['https://evil.example.com/a/b', 'other host'],
    ['https://github.com.evil.com/a/b', 'lookalike host'],
    ['https://user:pw@github.com/a/b', 'credentials'],
    ['https://github.com:8443/a/b', 'port'],
    ['https://github.com/a/b?x=1', 'query'],
    ['https://github.com/a/b#frag', 'fragment'],
    ['https://github.com/a', 'one segment'],
    ['https://github.com/a/b/c', 'three segments'],
    ['https://github.com/../b', 'traversal'],
    ['https://169.254.169.254/a/b', 'metadata ip'],
  ])('rejects %s (%s)', (url) => {
    expect(parsePublicRepoUrl(url).ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(parsePublicRepoUrl(undefined).ok).toBe(false);
    expect(parsePublicRepoUrl({}).ok).toBe(false);
  });
});

describe('publicWorkspaceId / IngestLimiter', () => {
  it('is deterministic per user+repo, distinct across users, and id-safe', () => {
    const a = publicWorkspaceId('user-1', 'Zephyrxx0', 'treads');
    expect(a).toBe(publicWorkspaceId('user-1', 'Zephyrxx0', 'treads'));
    expect(a).not.toBe(publicWorkspaceId('user-2', 'Zephyrxx0', 'treads'));
    expect(a).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(a.startsWith('pub-zephyrxx0-treads-')).toBe(true);
  });

  it('allows one job per user and a global cap, and frees slots on release', () => {
    const limiter = new IngestLimiter(2);
    const a = limiter.tryAcquire('a');
    expect('release' in a).toBe(true);
    expect(limiter.tryAcquire('a')).toEqual({ reason: 'user' });
    const b = limiter.tryAcquire('b');
    expect('release' in b).toBe(true);
    expect(limiter.tryAcquire('c')).toEqual({ reason: 'global' });
    (a as { release: () => void }).release();
    (a as { release: () => void }).release(); // idempotent
    expect('release' in limiter.tryAcquire('c')).toBe(true);
  });
});

describe('effectiveJob (dead-job detection)', () => {
  const now = 1_000_000;

  it('treats a missing job as queued', () => {
    expect(effectiveJob(null, now)).toEqual({ status: 'queued', progress: 0, error: null });
  });

  it('passes through a job that is still beating', () => {
    expect(effectiveJob({ status: 'indexing', progress: 0.8, updatedAt: now - 20 }, now)).toEqual({
      status: 'indexing',
      progress: 0.8,
      error: null,
    });
  });

  it('reports a silent running job as failed, with a helpful message', () => {
    const job = effectiveJob({ status: 'indexing', progress: 0.8, updatedAt: now - JOB_STALE_AFTER_SECONDS - 5 }, now);
    expect(job.status).toBe('failed');
    expect(job.progress).toBe(0.8);
    expect(job.error).toMatch(/stopped unexpectedly/);
    expect(job.error).toMatch(/restarted/);
  });

  it('never rewrites finished jobs, however old', () => {
    expect(effectiveJob({ status: 'completed', progress: 1, updatedAt: 1 }, now).status).toBe('completed');
    const failed = effectiveJob({ status: 'failed', progress: 0, error: 'repo not found', updatedAt: 1 }, now);
    expect(failed).toMatchObject({ status: 'failed', error: 'repo not found' });
  });

  it('does not judge jobs without a timestamp', () => {
    expect(effectiveJob({ status: 'cloning', progress: 0.15 }, now).status).toBe('cloning');
  });
});

describe('POST /api/v1/workspaces/ingest-public & GET .../ingest-status', () => {
  const query = vi.fn();
  const roQuery = vi.fn();
  const graphClient = { query, roQuery, ping: vi.fn().mockResolvedValue(true) } as unknown as ArgonGraphClient;
  const onIngestPublic = vi.fn();

  const makeApp = () =>
    createGatewayApp({ gatewaySecret: SECRET, graphClient, githubRouteOptions: { onIngestPublic } });

  const token = (userId: string, isAnonymous = true) =>
    sign({ userId, isAnonymous, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET, 'HS256');

  const post = async (app: ReturnType<typeof makeApp>, body: unknown, userId = 'guest-1') =>
    app.request('/api/v1/workspaces/ingest-public', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token(userId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ data: [] });
  });

  it('requires authentication', async () => {
    const res = await makeApp().request('/api/v1/workspaces/ingest-public', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid URLs with 400 and never touches the graph', async () => {
    const res = await post(makeApp(), { repoUrl: 'https://evil.example.com/a/b' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(onIngestPublic).not.toHaveBeenCalled();
  });

  it('lets a guest start an ingestion: 202, owner-only workspace, job dispatched with canonical URL', async () => {
    const res = await post(makeApp(), { repoUrl: 'https://github.com/Zephyrxx0/treads' });
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.status).toBe('queued');
    expect(body.workspaceId).toMatch(/^pub-zephyrxx0-treads-[0-9a-f]{6}$/);

    // ownership edge created, workspace NOT public
    const [wsArg, cypher, params] = query.mock.calls[0]!;
    expect(wsArg).toBe(body.workspaceId);
    expect(cypher).toContain('ACCESSES');
    expect(params).toMatchObject({ userId: 'guest-1', role: 'owner', isPublic: false });

    expect(onIngestPublic).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/Zephyrxx0/treads',
        workspaceId: body.workspaceId,
        userId: 'guest-1',
        release: expect.any(Function),
      })
    );
  });

  it('returns 429 for a second concurrent job from the same user, and frees the slot on release', async () => {
    const app = makeApp();
    const first = await post(app, { repoUrl: 'https://github.com/a/b' });
    expect(first.status).toBe(202);
    const second = await post(app, { repoUrl: 'https://github.com/a/c' });
    expect(second.status).toBe(429);

    onIngestPublic.mock.calls[0]![0].release();
    expect((await post(app, { repoUrl: 'https://github.com/a/c' })).status).toBe(202);
  });

  it('releases the slot when dispatch throws', async () => {
    const app = makeApp();
    onIngestPublic.mockRejectedValueOnce(new Error('boom'));
    expect((await post(app, { repoUrl: 'https://github.com/a/b' })).status).toBe(500);
    expect((await post(app, { repoUrl: 'https://github.com/a/b' })).status).toBe(202);
  });

  describe('ingest-status', () => {
    const accessRow = (exists: boolean, allowed: boolean) => ({ data: [{ exists, allowed }] });

    const get = async (app: ReturnType<typeof makeApp>, ws: string, userId = 'guest-1') =>
      app.request(`/api/v1/workspaces/${ws}/ingest-status`, {
        headers: { Authorization: `Bearer ${await token(userId)}` },
      });

    it('reports job progress and node counts to the owner', async () => {
      roQuery
        .mockResolvedValueOnce(accessRow(true, true))
        .mockResolvedValueOnce({
          data: [{ jobId: 'job_1', status: 'mining', progress: 0.45, error: null, repoUrl: 'https://github.com/a/b' }],
        })
        .mockResolvedValueOnce({ data: [{ nodeCount: 321 }] });

      const res = await get(makeApp(), 'pub-a-b-abc123');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        workspaceId: 'pub-a-b-abc123',
        status: 'mining',
        progress: 0.45,
        nodeCount: 321,
        error: null,
      });
    });

    it('reports "queued" before the pipeline has written its first status', async () => {
      roQuery
        .mockResolvedValueOnce(accessRow(true, true))
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [{ nodeCount: 0 }] });
      const body = (await (await get(makeApp(), 'pub-a-b-abc123')).json()) as any;
      expect(body.status).toBe('queued');
      expect(body.progress).toBe(0);
    });

    it('reports a job whose process died (no heartbeat) as failed instead of "indexing" forever', async () => {
      const longAgo = Math.floor(Date.now() / 1000) - 600;
      roQuery
        .mockResolvedValueOnce(accessRow(true, true))
        .mockResolvedValueOnce({ data: [{ jobId: 'j', status: 'indexing', progress: 0.8, error: null, updatedAt: longAgo }] })
        .mockResolvedValueOnce({ data: [{ nodeCount: 0 }] });
      const body = (await (await get(makeApp(), 'pub-a-b-abc123')).json()) as any;
      expect(body.status).toBe('failed');
      expect(body.error).toMatch(/stopped unexpectedly/);
    });

    it('surfaces a failed job with its error message', async () => {
      roQuery
        .mockResolvedValueOnce(accessRow(true, true))
        .mockResolvedValueOnce({ data: [{ jobId: 'j', status: 'failed', progress: 0, error: 'repository not found' }] })
        .mockResolvedValueOnce({ data: [{ nodeCount: 0 }] });
      const body = (await (await get(makeApp(), 'pub-a-b-abc123')).json()) as any;
      expect(body).toMatchObject({ status: 'failed', error: 'repository not found' });
    });

    it('enforces tenant access: 403 for other users, 404 for unknown workspaces', async () => {
      roQuery.mockResolvedValueOnce(accessRow(true, false));
      expect((await get(makeApp(), 'pub-a-b-abc123', 'stranger')).status).toBe(403);

      roQuery.mockResolvedValueOnce(accessRow(false, false));
      expect((await get(makeApp(), 'ghost')).status).toBe(404);

      roQuery.mockRejectedValueOnce(new Error('ERR Invalid graph operation on empty key'));
      expect((await get(makeApp(), 'ghost2')).status).toBe(404);
    });
  });
});
