import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGatewayApp } from '../../src/app.js';
import { EventBroadcaster } from '../../src/services/event-broadcaster.js';

describe('Gateway Server-Sent Events Route (Task 08-03-01, SYNC-03)', () => {
  const gatewaySecret = 'test-gateway-secret-12345';
  let broadcaster: EventBroadcaster;
  let mockGraphClient: any;

  beforeEach(() => {
    broadcaster = new EventBroadcaster();
    mockGraphClient = {
      roQuery: vi.fn().mockImplementation((...args: any[]) => {
        const cypher = typeof args[1] === 'string' ? args[1] : args[0];
        const params = typeof args[1] === 'string' ? args[2] : args[1];
        if (cypher.includes('OPTIONAL MATCH (u:User')) {
          if (params?.workspaceId === 'private-ws' && params?.userId === 'unauthorized-user') {
            return Promise.resolve({ data: [{ exists: true, allowed: false }] });
          }
          if (params?.workspaceId === 'missing-ws') {
            return Promise.resolve({ data: [{ exists: false, allowed: false }] });
          }
          return Promise.resolve({ data: [{ exists: true, allowed: true }] });
        }
        return Promise.resolve({ data: [] });
      }),
      query: vi.fn().mockResolvedValue({ data: [] }),
      ping: vi.fn().mockResolvedValue(true),
    };
  });

  function makeApp() {
    return createGatewayApp({
      graphClient: mockGraphClient,
      gatewaySecret,
      eventsOptions: {
        broadcaster,
        heartbeatIntervalMs: 100, // fast heartbeat for testing
      },
    });
  }

  async function makeJwt(userId: string): Promise<string> {
    const { sign } = await import('hono/jwt');
    return await sign(
      {
        userId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      gatewaySecret,
      'HS256',
    );
  }

  it('rejects unauthenticated requests to /events with 401 UNAUTHORIZED', async () => {
    const app = makeApp();
    const res = await app.request('/api/v1/workspaces/test-ws/events');

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests to non-existent workspace with 404 NOT_FOUND', async () => {
    const app = makeApp();
    const token = await makeJwt('test-user');
    const res = await app.request('/api/v1/workspaces/missing-ws/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(404);
  });

  it('rejects unauthorized requests to private workspace with 403 FORBIDDEN', async () => {
    const app = makeApp();
    const token = await makeJwt('unauthorized-user');
    const res = await app.request('/api/v1/workspaces/private-ws/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(403);
  });

  it('establishes text/event-stream with initial connected greeting and accepts token query param', async () => {
    const app = makeApp();
    const res = await app.request(`/api/v1/workspaces/test-ws/events?token=${gatewaySecret}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(broadcaster.listenerCount('test-ws')).toBe(1);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const firstChunk = await reader!.read();
    const text = decoder.decode(firstChunk.value);
    expect(text).toContain(': connected');

    // Abort stream and verify cleanup
    await reader!.cancel();
    // Allow abort callback to run
    await new Promise((r) => setTimeout(r, 20));
    expect(broadcaster.listenerCount('test-ws')).toBe(0);
  });

  it('delivers sync:complete delta payload to subscribers of that workspace', async () => {
    const app = makeApp();
    const res = await app.request('/api/v1/workspaces/ws-alpha/events', {
      headers: {
        Authorization: `Bearer ${gatewaySecret}`,
      },
    });

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial greeting
    await reader.read();

    // Broadcast sync:complete event to ws-alpha
    broadcaster.broadcast('ws-alpha', 'sync:complete', {
      workspaceId: 'ws-alpha',
      trigger: 'push',
      updated: {
        commits: ['sha-123'],
        files: ['src/main.ts'],
        decisions: [],
      },
      superseded: [],
    });

    const secondChunk = await reader.read();
    const text = decoder.decode(secondChunk.value);
    expect(text).toContain('event: sync:complete');
    expect(text).toContain('sha-123');
    expect(text).toContain('src/main.ts');

    await reader.cancel();
  });

  it('enforces tenant isolation and does not broadcast cross-workspace events', async () => {
    const app = makeApp();
    const resAlpha = await app.request('/api/v1/workspaces/ws-alpha/events', {
      headers: { Authorization: `Bearer ${gatewaySecret}` },
    });
    const resBeta = await app.request('/api/v1/workspaces/ws-beta/events', {
      headers: { Authorization: `Bearer ${gatewaySecret}` },
    });

    const readerAlpha = resAlpha.body!.getReader();
    const readerBeta = resBeta.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial greetings
    await readerAlpha.read();
    await readerBeta.read();

    // Broadcast only to ws-alpha
    broadcaster.broadcast('ws-alpha', 'sync:complete', {
      workspaceId: 'ws-alpha',
      trigger: 'push',
      updated: { commits: ['alpha-commit'], files: [], decisions: [] },
      superseded: [],
    });

    const alphaChunk = await readerAlpha.read();
    expect(decoder.decode(alphaChunk.value)).toContain('alpha-commit');

    // ws-beta should receive heartbeat instead of alpha event
    const betaChunk = await readerBeta.read();
    const betaText = decoder.decode(betaChunk.value);
    expect(betaText).not.toContain('alpha-commit');
    expect(betaText).toContain(': heartbeat');

    await readerAlpha.cancel();
    await readerBeta.cancel();
  });
});
