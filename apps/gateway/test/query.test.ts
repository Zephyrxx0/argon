import { describe, it, expect, vi } from 'vitest';
import { createGatewayApp } from '../src/app.js';
import { FalkorUnavailableError, type ArgonGraphClient } from '@argon/graph';
import type { GatewayErrorResponse } from '../src/types.js';

describe('Gateway Query Router', () => {
  const TEST_SECRET = 'test-secret';

  it('dispatches resolve_scope in snake_case and returns 200 with DualPayload', async () => {
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

    const res = await app.request('/api/v1/test-ws/query/resolve_scope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: ['src/app.ts'], names: ['core'] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveProperty('raw');
    expect(body).toHaveProperty('graph');
    expect(body).toHaveProperty('evidence');
    expect(body.evidence.nodeCount).toBeGreaterThanOrEqual(0);
  });

  it('dispatches revert_history (snake_case and camelCase) with the validated parameters', async () => {
    const roQuery = vi.fn().mockResolvedValue({
      data: [
        {
          node: { id: 3, labels: ['PullRequest'], properties: { id: 'pr_rev', is_revert: true } },
          reverted: { id: 4, labels: ['PullRequest'], properties: { id: 'pr_orig' } },
          files: ['src/auth.ts'],
        },
      ],
    });
    const app = createGatewayApp({
      graphClient: { ping: vi.fn().mockResolvedValue(true), roQuery } as unknown as ArgonGraphClient,
      gatewaySecret: TEST_SECRET,
    });

    for (const name of ['revert_history', 'revertHistory']) {
      const res = await app.request(`/api/v1/test-ws/query/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: ['src/auth.ts'] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.evidence.primaryIds).toContain('pr_rev');
    }
    // limit defaults to 20 via the shared Zod schema
    expect(roQuery.mock.calls[0]![2]).toEqual({ files: ['src/auth.ts'], limit: 20 });
    expect(roQuery.mock.calls[0]![1]).toContain('is_revert = true');
  });

  it('dispatches counterfactual_impact (snake_case and camelCase) and requires asOf', async () => {
    const roQuery = vi.fn().mockResolvedValue({
      data: [
        {
          target: 'billing',
          component: 'ledger',
          direction: 'DEPENDENT',
          hops: 1,
          score: 0.2,
          decisions: [{ id: 'DEC-2', title: 'Exponential backoff', status: 'active' }],
          owners: [],
        },
      ],
    });
    const app = createGatewayApp({
      graphClient: { ping: vi.fn().mockResolvedValue(true), roQuery } as unknown as ArgonGraphClient,
      gatewaySecret: TEST_SECRET,
    });
    const post = (name: string, body: unknown) =>
      app.request(`/api/v1/test-ws/query/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    for (const name of ['counterfactual_impact', 'counterfactualImpact']) {
      const res = await post(name, { component: 'billing', asOf: 1700000000000 });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.evidence.primaryIds).toEqual(expect.arrayContaining(['ledger', 'DEC-2']));
    }
    expect(roQuery.mock.calls[0]![2]).toEqual({ component: 'billing', asOf: 1700000000000 });
    expect(roQuery.mock.calls[0]![1]).toContain('algo.pageRank');

    expect((await post('counterfactual_impact', { component: 'billing' })).status).toBe(400);
    expect((await post('counterfactual_impact', { asOf: 5 })).status).toBe(400);
  });

  it('rejects revert_history without files (400 VALIDATION_ERROR)', async () => {
    const app = createGatewayApp({
      graphClient: { ping: vi.fn().mockResolvedValue(true), roQuery: vi.fn() } as unknown as ArgonGraphClient,
      gatewaySecret: TEST_SECRET,
    });
    const res = await app.request('/api/v1/test-ws/query/revert_history', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as GatewayErrorResponse).code).toBe('VALIDATION_ERROR');
  });

  it('dispatches resolveScope in camelCase and returns 200', async () => {
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
      body: JSON.stringify({ paths: ['src/app.ts'] }),
    });

    expect(res.status).toBe(200);
  });

  it('dispatches blast_radius / blastRadius and handles parameters', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
      roQuery: vi.fn().mockResolvedValue({
        data: [],
      }),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/blast_radius', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: ['apps/gateway/src/app.ts'], maxDepth: 2 }),
    });

    expect(res.status).toBe(200);
  });

  it('returns 404 UNKNOWN_QUERY for unrecognized query endpoint', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/unknown_procedure', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNKNOWN_QUERY');
    expect(body.error).toContain('Unknown query: unknown_procedure');
  });

  it('returns 400 VALIDATION_ERROR when request body has invalid parameters', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    // blast_radius requires `files` array with min length 1
    const res = await app.request('/api/v1/test-ws/query/blastRadius', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: 'not-an-array' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
  });

  it('returns 400 VALIDATION_ERROR when request body is malformed JSON', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/query/blastRadius', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: '{ broken json ',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 503 FALKORDB_TIMEOUT when query execution exceeds timeout threshold', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(true),
      roQuery: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500))
      ),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockClient,
      gatewaySecret: TEST_SECRET,
      queryTimeoutMs: 50, // Short timeout for test
    });

    const res = await app.request('/api/v1/test-ws/query/resolveScope', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: [] }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('FALKORDB_TIMEOUT');
    expect(body.error).toContain('timed out after 50ms');
  });

  it('returns 503 FALKORDB_UNREACHABLE when FalkorDB is unavailable or connection refused', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue(false),
      roQuery: vi.fn().mockRejectedValue(new FalkorUnavailableError('Connection refused: 6379')),
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
      body: JSON.stringify({ paths: [] }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('FALKORDB_UNREACHABLE');
    expect(body.error).toBe('FalkorDB is unreachable');
  });
});

