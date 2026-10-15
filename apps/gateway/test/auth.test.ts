import { describe, it, expect, vi } from 'vitest';
import { createGatewayApp } from '../src/app.js';
import type { ArgonGraphClient } from '@argon/graph';
import type { GatewayErrorResponse, GatewayHealthResponse } from '../src/types.js';

describe('Gateway Auth Middleware & Health Route', () => {
  const TEST_SECRET = 'super-secret-token-123';

  it('GET /health returns 200 and status ok without any Authorization header', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as GatewayHealthResponse;
    expect(body.status).toBe('ok');
    expect(body.falkor).toBe('healthy');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('number');
  });

  it('GET /health marks falkor unreachable when ping fails, but still returns 200', async () => {
    const mockClient = {
      ping: vi.fn().mockRejectedValue(new Error('Connection failed')),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as GatewayHealthResponse;
    expect(body.status).toBe('ok');
    expect(body.falkor).toBe('unreachable');
  });

  it('fails closed with 500 AUTH_CONFIG_ERROR when gateway secret is unconfigured', async () => {
    const app = createGatewayApp({
      gatewaySecret: undefined,
    });

    const res = await app.request('/api/v1/test-ws/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer any-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('AUTH_CONFIG_ERROR');
    expect(body.error).toContain('Server authentication unconfigured');
  });

  it('returns 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/resolveScope', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('Missing or malformed Authorization header');
  });

  it('returns 401 UNAUTHORIZED when Authorization header does not start with Bearer', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 UNAUTHORIZED when Bearer token does not match secret', async () => {
    const app = createGatewayApp({
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('Invalid Bearer token');
  });

  it('passes authentication when valid Bearer token is provided', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
      roQuery: vi.fn().mockResolvedValue({
        data: [{ matchedFiles: [], allComponents: [] }],
      }),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: ['src/app.ts'], names: [] }),
    });

    expect(res.status).toBe(200);
  });
});

