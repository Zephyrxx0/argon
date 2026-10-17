import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import { createGatewayApp } from '../../src/app.js';
import { GitHubUserService, type GitHubRepositoryItem } from '../../src/services/github-user.js';
import type { ArgonGraphClient } from '@argon/graph';

describe('GitHub repository routes (OAuth user token, no GitHub App)', () => {
  const SECRET = 'test-secret-gateway-jwt-32-chars-long!';

  const repos: GitHubRepositoryItem[] = [
    {
      id: 1, name: 'treads', fullName: 'Zephyrxx0/treads', private: false, defaultBranch: 'main',
      owner: { login: 'Zephyrxx0', avatarUrl: '' }, description: null, htmlUrl: 'https://github.com/Zephyrxx0/treads',
    },
    {
      id: 2, name: 'secret', fullName: 'Zephyrxx0/secret', private: true, defaultBranch: 'main',
      owner: { login: 'Zephyrxx0', avatarUrl: '' }, description: null, htmlUrl: 'https://github.com/Zephyrxx0/secret',
    },
  ];

  const token = (payload: Record<string, unknown>) =>
    sign({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET, 'HS256');

  describe('GET /repositories', () => {
    it('401 for unauthenticated and anonymous callers', async () => {
      const app = createGatewayApp({ gatewaySecret: SECRET });
      expect((await app.request('/api/v1/github/repositories')).status).toBe(401);

      const anon = await token({ userId: 'g', isAnonymous: true });
      expect(
        (await app.request('/api/v1/github/repositories', { headers: { Authorization: `Bearer ${anon}` } })).status
      ).toBe(401);
    });

    it('401 when the session carries no GitHub token', async () => {
      const app = createGatewayApp({ gatewaySecret: SECRET });
      const t = await token({ userId: 'u1', isAnonymous: false });
      const res = await app.request('/api/v1/github/repositories', { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(401);
    });

    it('lists public + private repos via the user OAuth token', async () => {
      const listUserRepositories = vi.fn().mockResolvedValue(repos);
      const svc = { listUserRepositories, getRepository: vi.fn() } as unknown as GitHubUserService;
      const app = createGatewayApp({ gatewaySecret: SECRET, githubUserService: svc });

      const t = await token({ userId: 'u1', isAnonymous: false, userAccessToken: 'gho_abc' });
      const res = await app.request('/api/v1/github/repositories', { headers: { Authorization: `Bearer ${t}` } });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { repositories: GitHubRepositoryItem[] };
      expect(body.repositories.map((r) => r.fullName)).toEqual(['Zephyrxx0/treads', 'Zephyrxx0/secret']);
      expect(body.repositories.some((r) => r.private)).toBe(true);
      // listed with the caller's token, no App/installation involved
      expect(listUserRepositories).toHaveBeenCalledWith('gho_abc');
    });

    it('surfaces a 401 from GitHub (dead token) as 401', async () => {
      const listUserRepositories = vi.fn().mockRejectedValue(Object.assign(new Error('Bad credentials'), { status: 401 }));
      const svc = { listUserRepositories, getRepository: vi.fn() } as unknown as GitHubUserService;
      const app = createGatewayApp({ gatewaySecret: SECRET, githubUserService: svc });
      const t = await token({ userId: 'u1', isAnonymous: false, userAccessToken: 'dead' });
      const res = await app.request('/api/v1/github/repositories', { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /ingest', () => {
    const query = vi.fn();
    const graphClient = { query, roQuery: vi.fn(), ping: vi.fn().mockResolvedValue(true) } as unknown as ArgonGraphClient;

    const makeApp = (over?: { onIngest?: ReturnType<typeof vi.fn>; getRepository?: ReturnType<typeof vi.fn> }) => {
      const getRepository =
        over?.getRepository ??
        vi.fn().mockResolvedValue({ ...repos[1], fullName: 'Zephyrxx0/secret', htmlUrl: 'https://github.com/Zephyrxx0/secret' });
      const svc = { listUserRepositories: vi.fn(), getRepository } as unknown as GitHubUserService;
      const onIngest = over?.onIngest ?? vi.fn();
      const app = createGatewayApp({ gatewaySecret: SECRET, graphClient, githubUserService: svc, githubRouteOptions: { onIngest } });
      return { app, onIngest, getRepository };
    };

    beforeEach(() => {
      vi.clearAllMocks();
      query.mockResolvedValue({ data: [] });
    });

    const post = async (app: ReturnType<typeof makeApp>['app'], body: unknown, payload: Record<string, unknown>) =>
      app.request('/api/v1/github/ingest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token({ userId: 'u1', isAnonymous: false, ...payload })}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('requires auth + a GitHub token', async () => {
      const { app } = makeApp();
      expect((await app.request('/api/v1/github/ingest', { method: 'POST', body: '{}' })).status).toBe(401);
      // authed but no token
      expect((await post(app, { repositoryFullName: 'Zephyrxx0/secret' }, {})).status).toBe(401);
    });

    it('rejects a bad repositoryFullName', async () => {
      const { app } = makeApp();
      expect((await post(app, { repositoryFullName: 'not-a-repo' }, { userAccessToken: 'gho' })).status).toBe(400);
    });

    it('ingests the user private repo using their OAuth token (no installationId needed)', async () => {
      const { app, onIngest } = makeApp();
      const res = await post(app, { repositoryFullName: 'Zephyrxx0/secret' }, { userAccessToken: 'gho_abc', login: 'Zephyrxx0' });
      expect(res.status).toBe(202);
      const body = (await res.json()) as any;
      expect(body.status).toBe('queued');
      expect(body.private).toBe(true);
      expect(onIngest).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryFullName: 'Zephyrxx0/secret',
          accessToken: 'gho_abc',
          userId: 'u1',
          release: expect.any(Function),
        })
      );
      // ownership edge written, workspace not public
      const [, cypher, params] = query.mock.calls[0]!;
      expect(cypher).toContain('ACCESSES');
      expect(params).toMatchObject({ userId: 'u1', role: 'owner', isPublic: false });
    });

    it('404 when the repo is not accessible with the user token', async () => {
      const { app, onIngest } = makeApp({ getRepository: vi.fn().mockResolvedValue(null) });
      const res = await post(app, { repositoryFullName: 'someone/else' }, { userAccessToken: 'gho_abc' });
      expect(res.status).toBe(404);
      expect(onIngest).not.toHaveBeenCalled();
    });
  });
});
