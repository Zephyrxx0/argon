import { describe, it, expect, vi } from 'vitest';
import { createGatewayApp } from '../src/app.js';
import type { ArgonGraphClient } from '@argon/graph';
import type { Briefing } from '@argon/agent';

describe('Gateway Briefing Endpoint', () => {
  const TEST_SECRET = 'briefing-secret';

  const mockBriefing: Briefing = {
    summary: {
      overview: 'Gateway briefing overview',
      riskLevel: 'low',
      keyTakeaways: [
        {
          claim: 'Touches query.ts',
          citedNodeIds: ['apps/gateway/src/routes/query.ts'],
        },
      ],
    },
    blastRadius: {
      analysis: 'Isolated to gateway route',
      affectedComponents: [
        {
          component: 'apps/gateway',
          reason: 'Direct modification',
          citedNodeIds: ['apps/gateway'],
        },
      ],
    },
    keyOwners: [],
    constrainingDecisions: [],
    precedents: [],
  };

  it('dispatches POST /api/v1/:workspaceId/briefing with custom generator and returns 200', async () => {
    const mockGraphClient = {
      ping: vi.fn().mockResolvedValue(true),
      roQuery: vi.fn().mockImplementation((_ws, cypher) => {
        if (cypher.includes('resolve_scope')) {
          return Promise.resolve({
            data: [
              {
                matchedFiles: [{ path: 'apps/gateway/src/routes/query.ts' }],
                allComponents: [{ name: 'apps/gateway' }],
              },
            ],
          });
        }
        if (cypher.includes('blast_radius')) {
          return Promise.resolve({
            data: [
              {
                f: { path: 'apps/gateway/src/routes/query.ts' },
                c: { name: 'apps/gateway' },
              },
            ],
          });
        }
        return Promise.resolve({ data: [] });
      }),
      query: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as ArgonGraphClient;

    const mockEmbedder = {
      embed: vi.fn().mockResolvedValue({
        vector: new Array(512).fill(0.05),
        dim: 512,
        provider: 'local',
        model: 'embeddinggemma-2',
      }),
    };

    const app = createGatewayApp({
      graphClient: mockGraphClient,
      gatewaySecret: TEST_SECRET,
      briefingOptions: {
        customGenerator: vi.fn().mockResolvedValue(mockBriefing),
        embedder: mockEmbedder as any,
      },
    });

    const res = await app.request('/api/v1/test-ws/briefing', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'Refactor query routing in apps/gateway/src/routes/query.ts',
        contributorId: 'author-bob',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('SUCCESS');
    expect(body.briefing).toBeDefined();
    expect(body.briefing.summary.riskLevel).toBe('low');
    expect(body.briefingId).toBeDefined();
    expect(body.evidence.verifiedCitationCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects unauthenticated briefing requests with 401', async () => {
    const mockGraphClient = {
      ping: vi.fn().mockResolvedValue(true),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockGraphClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/briefing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'Update gateway',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects invalid request body with 400 VALIDATION_ERROR', async () => {
    const mockGraphClient = {
      ping: vi.fn().mockResolvedValue(true),
    } as unknown as ArgonGraphClient;

    const app = createGatewayApp({
      graphClient: mockGraphClient,
      gatewaySecret: TEST_SECRET,
    });

    const res = await app.request('/api/v1/test-ws/briefing', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // missing required 'task'
        files: ['invalid'],
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
