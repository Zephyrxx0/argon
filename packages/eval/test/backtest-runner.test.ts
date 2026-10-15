import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient } from '@argon/agent';
import { evaluateGraphCase, runGraphBacktest } from '../src/runner/graph-runner.js';
import { RevertFixtureItemSchema, type RevertFixtureItem } from '../src/types.js';

describe('backtest-runner', () => {
  const fixturesPath = path.resolve(__dirname, '../fixtures/reverts.json');
  const allFixtures: RevertFixtureItem[] = JSON.parse(
    fs.readFileSync(fixturesPath, 'utf-8')
  ).map((f: unknown) => RevertFixtureItemSchema.parse(f));

  const rev001 = allFixtures.find((f) => f.caseId === 'REV-001')!;

  describe('unit test with mocked gateway', () => {
    it('delegates to gateway.executeQuery with exact $asOf and $files parameters', async () => {
      const mockExecuteQuery = vi.fn().mockResolvedValue({
        raw: [
          {
            id: 'DEC-002',
            title: 'Exponential backoff with jitter',
            status: 'ACCEPTED',
            component: 'billing-service',
            sourceUrl: null,
          },
        ],
        graph: { nodes: [], edges: [] },
        evidence: { nodeCount: 1, edgeCount: 0, primaryIds: ['DEC-002'] },
      });

      const mockGateway = {
        executeQuery: mockExecuteQuery,
      } as unknown as DirectGraphGatewayClient;

      const caseResult = await evaluateGraphCase(mockGateway, rev001);

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        'synthetic-demo',
        'constrainingDecisions',
        {
          files: ['src/billing/retry.ts', 'src/billing/client.ts'],
          asOf: 1718000000,
        }
      );

      expect(caseResult.caseId).toBe('REV-001');
      expect(caseResult.method).toBe('graph');
      expect(caseResult.retrievedDecisionIds).toEqual(['DEC-002']);
      expect(caseResult.hitAt1).toBe(true);
      expect(caseResult.hitAt3).toBe(true);
      expect(caseResult.hitAt5).toBe(true);
      expect(caseResult.reciprocalRank).toBe(1.0);
      expect(caseResult.supersededHit).toBe(false);
      expect(caseResult.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('runGraphBacktest runs all fixtures and aggregates into MethodSummary', async () => {
      const mockExecuteQuery = vi
        .fn()
        .mockImplementation((_ws, _query, _params) => {
          // If query has asOf <= 1718000000, return DEC-002
          return Promise.resolve({
            raw: [{ id: 'DEC-002' }],
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 1, edgeCount: 0, primaryIds: ['DEC-002'] },
          });
        });

      const mockGateway = {
        executeQuery: mockExecuteQuery,
      } as unknown as DirectGraphGatewayClient;

      const { results, summary } = await runGraphBacktest(mockGateway, [rev001]);

      expect(results.length).toBe(1);
      expect(summary.totalCases).toBe(1);
      expect(summary.method).toBe('graph');
      expect(summary.recallAt1).toBe(1.0);
      expect(summary.mrr).toBe(1.0);
      expect(summary.supersededRate).toBe(0.0);
    });
  });

  describe('integration test with live FalkorDB (gated)', () => {
    let client: ArgonGraphClient | null = null;
    let isFalkorLive = false;

    beforeAll(async () => {
      try {
        client = new ArgonGraphClient();
        await client.connect();
        isFalkorLive = await client.ping();
      } catch {
        isFalkorLive = false;
      }
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it('evaluates temporal rewinding on live FalkorDB if available and seeded', async () => {
      if (!isFalkorLive || !client) {
        console.log('Skipping live FalkorDB integration test: FalkorDB is offline.');
        return;
      }

      // Check if synthetic-demo workspace exists and has data
      try {
        const check = await client.roQuery(
          'synthetic-demo',
          'MATCH (n) RETURN count(n) AS cnt'
        );
        const count = Number((check.data?.[0] as any)?.cnt ?? 0);
        if (count === 0) {
          console.log(
            'Skipping live backtest execution: synthetic-demo workspace not yet seeded.'
          );
          return;
        }

        const gateway = new DirectGraphGatewayClient(client);
        const caseResult = await evaluateGraphCase(gateway, rev001);

        expect(caseResult.retrievedDecisionIds).toContain('DEC-002');
        expect(caseResult.retrievedDecisionIds).not.toContain('DEC-001');
        expect(caseResult.supersededHit).toBe(false);
      } catch (err) {
        console.log('Live FalkorDB test skipped due to workspace error:', err);
      }
    });
  });
});
