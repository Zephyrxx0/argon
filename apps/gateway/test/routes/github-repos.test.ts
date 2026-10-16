import { describe, it, expect, vi } from 'vitest';
import { sign } from 'hono/jwt';
import { createGatewayApp } from '../../src/app.js';
import { GitHubAppService, type GitHubRepositoryItem } from '../../src/services/github-app.js';
import type { ArgonGraphClient } from '@argon/graph';

describe('GitHub Repository & Ingestion Routes (Task 07-02-02, ING-04, TENANT-02)', () => {
  const TEST_SECRET = 'test-secret-gateway-jwt-32-chars-long!';

  const mockRepos: GitHubRepositoryItem[] = [
    {
      id: 501,
      name: 'argon-core',
      fullName: 'argon-org/argon-core',
      private: true,
      defaultBranch: 'main',
      owner: { login: 'argon-org', avatarUrl: 'https://github.com/argon.png' },
      description: 'Private core engine',
      htmlUrl: 'https://github.com/argon-org/argon-core',
      installationId: 1001,
    },
    {
      id: 502,
      name: 'argon-docs',
      fullName: 'argon-org/argon-docs',
      private: false,
      defaultBranch: 'master',
      owner: { login: 'argon-org', avatarUrl: 'https://github.com/argon.png' },
      description: 'Public documentation',
      htmlUrl: 'https://github.com/argon-org/argon-docs',
      installationId: 1001,
    },
  ];

  it('rejects unauthenticated requests to GET /api/v1/github/repositories with 401', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/github/repositories');
    expect(res.status).toBe(401);
  });

  it('rejects anonymous guests from GET /api/v1/github/repositories with 401', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const anonToken = await sign(
      { userId: 'anon-guest-456', isAnonymous: true },
      TEST_SECRET,
      'HS256'
    );

    const res = await app.request('/api/v1/github/repositories', {
      headers: {
        Authorization: `Bearer ${anonToken}`,
      },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Authentication required');
  });

  it('returns authorized repository list for authenticated user', async () => {
    const mockService = {
      getUserRepositories: vi.fn().mockResolvedValue(mockRepos),
      verifyUserInstallation: vi.fn(),
      getInstallationToken: vi.fn(),
    } as unknown as GitHubAppService;

    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
      githubAppService: mockService,
    });

    const userToken = await sign(
      { userId: 'user-789', isAnonymous: false },
      TEST_SECRET,
      'HS256'
    );

    const res = await app.request('/api/v1/github/repositories', {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.repositories).toHaveLength(2);
    expect(body.repositories[0].name).toBe('argon-core');
    expect(body.repositories[0].private).toBe(true);
  });

  it('rejects unauthenticated requests to POST /api/v1/github/ingest with 401', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/github/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repositoryFullName: 'argon-org/argon-core',
        installationId: 1001,
      }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 400 VALIDATION_ERROR on malformed ingest payload', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const userToken = await sign(
      { userId: 'user-789', isAnonymous: false },
      TEST_SECRET,
      'HS256'
    );

    const res = await app.request('/api/v1/github/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // missing repositoryFullName and installationId
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('enforces dual verification and refuses unauthorized installation with 403 (D-04, T-07-04)', async () => {
    const mockService = {
      verifyUserInstallation: vi.fn().mockResolvedValue(false), // unauthorized!
      getInstallationToken: vi.fn(),
    } as unknown as GitHubAppService;

    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
      githubAppService: mockService,
    });

    const userToken = await sign(
      { userId: 'attacker-user', isAnonymous: false },
      TEST_SECRET,
      'HS256'
    );

    const res = await app.request('/api/v1/github/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repositoryFullName: 'victim-org/secret-repo',
        installationId: 9999,
      }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.code).toBe('FORBIDDEN');
    expect(body.error).toContain('not authorized for this GitHub App installation');
    expect(mockService.getInstallationToken).not.toHaveBeenCalled();
  });

  it('dispatches ingestion, passes installation token, and provisions workspace ownership on authorization success', async () => {
    const onIngestSpy = vi.fn().mockResolvedValue(undefined);
    const mockService = {
      verifyUserInstallation: vi.fn().mockResolvedValue(true),
      getInstallationToken: vi.fn().mockResolvedValue('ghs_authorized_token_777'),
    } as unknown as GitHubAppService;

    const mockGraphClient = {
      query: vi.fn().mockResolvedValue({ records: [] }),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
      githubAppService: mockService,
      graphClient: mockGraphClient,
      githubRouteOptions: {
        onIngest: onIngestSpy,
      },
    });

    const userToken = await sign(
      { userId: 'legit-user-888', isAnonymous: false },
      TEST_SECRET,
      'HS256'
    );

    const res = await app.request('/api/v1/github/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repositoryFullName: 'argon-org/argon-core',
        installationId: 1001,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('queued');
    expect(body.workspaceId).toBe('argon-org-argon-core');

    // Verify token was minted and forwarded in memory
    expect(mockService.getInstallationToken).toHaveBeenCalledWith(1001);
    expect(onIngestSpy).toHaveBeenCalledWith({
      repositoryFullName: 'argon-org/argon-core',
      installationId: 1001,
      installationToken: 'ghs_authorized_token_777',
      workspaceId: 'argon-org-argon-core',
      userId: 'legit-user-888',
    });

    // Verify FalkorDB setUserWorkspaceAccess was invoked
    expect(mockGraphClient.query).toHaveBeenCalled();
  });
});
