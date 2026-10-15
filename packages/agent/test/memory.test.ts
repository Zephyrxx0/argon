import { describe, it, expect, vi } from 'vitest';
import { recordOutcome } from '../src/memory/record-outcome.js';
import type { ArgonGraphClient } from '@argon/graph';

describe('Briefing Write-Back Memory (record_outcome)', () => {
  it('creates Briefing node and writes CITES, ABOUT, and REQUESTED edges with parameterized queries', async () => {
    const executedQueries: Array<{ cypher: string; params: any }> = [];

    const mockGraphClient = {
      query: vi.fn().mockImplementation((_ws: string, cypher: string, params: any) => {
        executedQueries.push({ cypher, params });
        return Promise.resolve({ data: [] });
      }),
    } as unknown as ArgonGraphClient;

    const result = await recordOutcome(mockGraphClient, {
      workspaceId: 'ws-argon',
      task: 'Refactor gateway auth',
      summary: 'Auth middleware refactored to fail-closed Bearer token check',
      contributorId: 'dev-alice',
      citedNodeIds: ['packages/graph/src/client.ts', 'ADR-001'],
      affectedComponents: ['apps/gateway', 'packages/graph'],
      scopeHash: 'hash-abc-123',
    });

    expect(result.briefingId).toBeDefined();
    expect(result.createdEdges.cites).toBe(2);
    expect(result.createdEdges.about).toBe(2);
    expect(result.createdEdges.requested).toBe(1);

    // 4 queries executed: CREATE node, LINK cites, LINK about, LINK requested
    expect(executedQueries).toHaveLength(4);

    // Verify node creation parameters
    const nodeCreation = executedQueries[0];
    expect(nodeCreation.cypher).toContain('MERGE (b:Briefing { id: $briefingId })');
    expect(nodeCreation.params.task).toBe('Refactor gateway auth');
    expect(nodeCreation.params.actorId).toBe('dev-alice');
    expect(nodeCreation.params.scopeHash).toBe('hash-abc-123');

    // Verify citations edge parameterization
    const citesLinking = executedQueries[1];
    expect(citesLinking.cypher).toContain('[:CITES]->');
    expect(citesLinking.params.batch).toEqual([
      'packages/graph/src/client.ts',
      'ADR-001',
    ]);

    // Verify component edge parameterization
    const aboutLinking = executedQueries[2];
    expect(aboutLinking.cypher).toContain('[:ABOUT]->');
    expect(aboutLinking.params.batch).toEqual(['apps/gateway', 'packages/graph']);

    // Verify actor attribution parameterization
    const reqLinking = executedQueries[3];
    expect(reqLinking.cypher).toContain('[:REQUESTED]->');
    expect(reqLinking.params.contributorId).toBe('dev-alice');
  });

  it('skips REQUESTED edge when contributorId is omitted', async () => {
    const executedQueries: Array<{ cypher: string; params: any }> = [];

    const mockGraphClient = {
      query: vi.fn().mockImplementation((_ws: string, cypher: string, params: any) => {
        executedQueries.push({ cypher, params });
        return Promise.resolve({ data: [] });
      }),
    } as unknown as ArgonGraphClient;

    const result = await recordOutcome(mockGraphClient, {
      workspaceId: 'ws-argon',
      task: 'Anonymous task query',
      summary: 'Anonymous summary',
      citedNodeIds: ['ADR-001'],
      affectedComponents: ['core'],
    });

    expect(result.createdEdges.requested).toBe(0);
    // Only 3 queries executed: CREATE node, LINK cites, LINK about
    expect(executedQueries).toHaveLength(3);
  });
});

