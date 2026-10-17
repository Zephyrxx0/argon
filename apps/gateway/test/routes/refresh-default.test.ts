import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import type { ArgonGraphClient } from '@argon/graph';

const runIngestion = vi.hoisted(() => vi.fn());
vi.mock('@argon/ingest', () => ({ runIngestion }));

import { createGatewayApp } from '../../src/app.js';
import { eventBroadcaster } from '../../src/services/event-broadcaster.js';
import type { GitHubUserService } from '../../src/services/github-user.js';

const SECRET = 'test-secret-gateway-jwt-32-chars-long!';
const NOW = Math.floor(Date.now() / 1000);

/** The gateway's own wiring of POST /refresh: what it hands to the ingest pipeline and what it broadcasts. */
describe('default re-sync handler (gateway wiring)', () => {
  const roQuery = vi.fn(async (_ws: string, cypher: string) => {
    if (cypher.includes('ACCESSES')) return { data: [{ exists: 1, role: 'owner' }] };
    if (cypher.includes("status: 'completed'")) return { data: [{ at: NOW - 7200 }] };
    return {
      data: [{ jobId: 'job_old', status: 'completed', progress: 1, error: null, repoUrl: 'https://github.com/acme/widgets', updatedAt: NOW - 7200 }],
    };
  });
  const graphClient = { query: vi.fn(), roQuery, ping: vi.fn().mockResolvedValue(true) } as unknown as ArgonGraphClient;
  const githubUserService = {
    getRepository: vi.fn().mockResolvedValue({ fullName: 'acme/widgets' }),
    listUserRepositories: vi.fn(),
  } as unknown as GitHubUserService;

  const summary = {
    delta: {
      newCommitCount: 2,
      newCommits: ['pr_aaa', 'pr_bbb'],
      newFiles: ['src/billing/retry.ts'],
      newDecisions: ['dec_commit_bbb'],
      supersededDecisions: ['dec_adr_old'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventBroadcaster.clear();
  });

  const refresh = async () => {
    const app = createGatewayApp({ gatewaySecret: SECRET, graphClient, githubUserService });
    const t = await sign({ userId: 'u1', isAnonymous: false, userAccessToken: 'gho_x', exp: NOW + 600 }, SECRET, 'HS256');
    return app.request('/api/v1/workspaces/pub-acme-widgets-abc123/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    });
  };

  it('runs a full-history ingestion that reads GitHub activity since the last job, then tells subscribers what changed', async () => {
    runIngestion.mockResolvedValue(summary);
    const events: Array<{ event: string; data: any }> = [];
    eventBroadcaster.subscribe('pub-acme-widgets-abc123', (event, data) => events.push({ event, data }));

    const res = await refresh();
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;

    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(runIngestion).toHaveBeenCalledTimes(1);
    const config = runIngestion.mock.calls[0]![0];
    expect(config).toMatchObject({
      repoUrl: 'https://github.com/acme/widgets',
      workspaceId: 'pub-acme-widgets-abc123',
      jobId: body.jobId,
      accessToken: 'gho_x',
      userId: 'u1',
      github: { since: body.since },
    });
    // the git history is re-mined in full (components / coupling are derived from the whole window)
    expect(config.since).toBeUndefined();
    expect(config.maxCommits).toBe(500);

    expect(events[0]).toEqual({
      event: 'sync:complete',
      data: {
        workspaceId: 'pub-acme-widgets-abc123',
        updated: { commits: ['pr_aaa', 'pr_bbb'], files: ['src/billing/retry.ts'], decisions: ['dec_commit_bbb'] },
        superseded: ['dec_adr_old'],
      },
    });
  });

  it('does not broadcast when the re-sync fails, and the user can retry afterwards (slot released)', async () => {
    runIngestion.mockRejectedValueOnce(new Error('clone failed'));
    const events: unknown[] = [];
    eventBroadcaster.subscribe('pub-acme-widgets-abc123', (event) => events.push(event));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = createGatewayApp({ gatewaySecret: SECRET, graphClient, githubUserService });
    const t = await sign({ userId: 'u1', isAnonymous: false, userAccessToken: 'gho_x', exp: NOW + 600 }, SECRET, 'HS256');
    const go = () =>
      app.request('/api/v1/workspaces/pub-acme-widgets-abc123/refresh', { method: 'POST', headers: { Authorization: `Bearer ${t}` } });

    expect((await go()).status).toBe(202);
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalled());
    expect(events).toEqual([]);

    runIngestion.mockResolvedValue(summary);
    await vi.waitFor(async () => expect((await go()).status).toBe(202));
    errorLog.mockRestore();
  });
});
