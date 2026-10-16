import { describe, it, expect, vi } from 'vitest';
import { sign } from 'hono/jwt';
import { createGatewayApp } from '../../src/app.js';
import type { ArgonGraphClient } from '@argon/graph';
import type { GatewayErrorResponse } from '../../src/types.js';

describe('Gateway Tenant Authorization Guard', () => {
  const SECRET = 'test-tenant-secret-at-least-32-chars-long';

  async function makeJwt(payload: Record<string, unknown>): Promise<string> {
    return await sign(
      {
        ...payload,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      SECRET,
      'HS256'
    );
  }

  function setupMockClient() {
    return {
      ping: vi.fn().mockResolvedValue(true),
      roQuery: vi.fn().mockImplementation((workspaceId: string, cypher: string, params: any) => {
        // Tenant authorization checkWorkspaceAccess query
        if (cypher.includes('OPTIONAL MATCH (u:User {id: $userId})-[r:ACCESSES]->(w)')) {
          if (workspaceId === 'missing-workspace') {
            return Promise.resolve({ data: [] });
          }
          if (workspaceId === 'public-showcase') {
            return Promise.resolve({ data: [{ exists: true, allowed: true }] });
          }
          if (workspaceId === 'private-repo') {
            if (params?.userId === 'usr_authorized_alice') {
              return Promise.resolve({ data: [{ exists: true, allowed: true }] });
            }
            return Promise.resolve({ data: [{ exists: true, allowed: false }] });
          }
        }

        // Standard query responses (e.g. resolveScope)
        return Promise.resolve({
          data: [{ matchedFiles: [], allComponents: [] }],
        });
      }),
    } as unknown as ArgonGraphClient;
  }

  it('returns 404 Not Found with NOT_FOUND code when workspace does not exist', async () => {
    const mockClient = setupMockClient();
    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: SECRET,
    });

    const token = await makeJwt({ userId: 'usr_stranger', isAnonymous: false });

    const res = await app.request('/api/v1/missing-workspace/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: ['src/app.ts'] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
    expect(body.error).toBe("Workspace 'missing-workspace' not found");
  });

  it('returns 403 Forbidden with FORBIDDEN code and "Workspace access denied" when caller lacks access', async () => {
    const mockClient = setupMockClient();
    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: SECRET,
    });

    const token = await makeJwt({ userId: 'usr_unauthorized_guest', isAnonymous: true });

    const res = await app.request('/api/v1/private-repo/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: ['src/app.ts'] }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('FORBIDDEN');
    expect(body.error).toBe('Workspace access denied');
  });

  it('allows access (200 OK) to public showcase workspace for anonymous visitor', async () => {
    const mockClient = setupMockClient();
    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: SECRET,
    });

    const guestToken = await makeJwt({ sub: 'guest_explorer_123', isAnonymous: true });

    const res = await app.request('/api/v1/public-showcase/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: ['src/app.ts'] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('raw');
    expect(body).toHaveProperty('graph');
  });

  it('allows access (200 OK) to private workspace when user has authorized [:ACCESSES] edge', async () => {
    const mockClient = setupMockClient();
    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: SECRET,
    });

    const memberToken = await makeJwt({ userId: 'usr_authorized_alice', isAnonymous: false });

    const res = await app.request('/api/v1/private-repo/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: ['src/app.ts'] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('raw');
    expect(body).toHaveProperty('graph');
  });

  it('enforces tenant authorization on briefing routes as well', async () => {
    const mockClient = setupMockClient();
    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: SECRET,
    });

    const unauthorizedToken = await makeJwt({ userId: 'usr_intruder', isAnonymous: false });

    const res = await app.request('/api/v1/private-repo/briefing', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${unauthorizedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: 'Analyze vulnerability' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('FORBIDDEN');
    expect(body.error).toBe('Workspace access denied');
  });
});
