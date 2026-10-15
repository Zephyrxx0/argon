import { describe, it, expect, vi } from 'vitest';
import { dispatchRetrievalBundle } from '../src/briefing/dispatcher.js';
import type { GatewayClient } from '../src/client/types.js';
import type { ResolvedScope } from '../src/briefing/types.js';

describe('Parallel Retrieval Dispatcher', () => {
  const dummyScope: ResolvedScope = {
    files: ['packages/graph/src/client.ts'],
    components: ['packages/graph'],
    queryVector: new Array(512).fill(0.05),
    rawTask: 'Investigate client connection',
    asOf: 1700000000,
  };

  it('runs retrieval queries concurrently and returns a successful bounded EvidenceBundle', async () => {
    const mockClient = {
      executeQuery: vi.fn().mockImplementation((_ws, queryName) => {
        if (queryName === 'blastRadius') {
          return Promise.resolve({
            raw: [
              {
                f: { path: 'packages/graph/src/client.ts' },
                c: { name: 'packages/graph' },
                downstream: { name: 'apps/gateway' },
              },
            ],
            graph: {
              nodes: [
                { data: { id: 'packages/graph/src/client.ts', label: 'client.ts', type: 'File', properties: {} } },
                { data: { id: 'packages/graph', label: 'packages/graph', type: 'Component', properties: {} } },
                { data: { id: 'apps/gateway', label: 'apps/gateway', type: 'Component', properties: {} } },
              ],
              edges: [],
            },
            evidence: {
              nodeCount: 3,
              edgeCount: 2,
              primaryIds: ['packages/graph/src/client.ts', 'packages/graph', 'apps/gateway'],
            },
          });
        }
        if (queryName === 'whoKnows') {
          return Promise.resolve({
            raw: [
              {
                component: 'packages/graph',
                authorId: 'person-1',
                authorName: 'Alice',
                authoredCount: 12,
                reviewerId: 'person-2',
                reviewerName: 'Bob',
                reviewedCount: 8,
              },
            ],
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 2, edgeCount: 0, primaryIds: ['person-1', 'person-2'] },
          });
        }
        if (queryName === 'constrainingDecisions') {
          return Promise.resolve({
            raw: [
              {
                id: 'ADR-001',
                title: 'Use FalkorDB for Graph Data',
                status: 'ACCEPTED',
                component: 'packages/graph',
              },
            ],
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 1, edgeCount: 0, primaryIds: ['ADR-001'] },
          });
        }
        if (queryName === 'precedentSearch') {
          return Promise.resolve({
            raw: [
              {
                decision: { id: 'ADR-002', title: 'Connection Pooling' },
                score: 0.85,
                component: { name: 'packages/graph' },
              },
              {
                decision: { id: 'ADR-003', title: 'Low Similarity Legacy Rule' },
                score: 0.42, // Under 0.60 threshold
                component: { name: 'legacy' },
              },
            ],
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 2, edgeCount: 0, primaryIds: ['ADR-002', 'ADR-003'] },
          });
        }
        return Promise.resolve({ raw: [], graph: { nodes: [], edges: [] }, evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] } });
      }),
    } as unknown as GatewayClient;

    const res = await dispatchRetrievalBundle(mockClient, 'ws-test', dummyScope);

    expect(res.status).toBe('SUCCESS');
    expect(res.bundle).toBeDefined();

    const bundle = res.bundle!;
    expect(bundle.touchedFiles).toHaveLength(1);
    expect(bundle.blastComponents).toHaveLength(1);
    expect(bundle.keyOwners).toHaveLength(2);
    expect(bundle.constrainingDecisions).toHaveLength(1);

    // Verifies score >= 0.60 cutoff: ADR-002 kept (0.85), ADR-003 filtered out (0.42)
    expect(bundle.precedents).toHaveLength(1);
    expect(bundle.precedents[0].decisionId).toBe('ADR-002');
    expect(bundle.precedents[0].similarityScore).toBe(0.85);

    // Verifies allNodeIds collection
    expect(bundle.allNodeIds.has('packages/graph/src/client.ts')).toBe(true);
    expect(bundle.allNodeIds.has('ADR-001')).toBe(true);
    expect(bundle.allNodeIds.has('ADR-002')).toBe(true);
    expect(bundle.allNodeIds.has('person-1')).toBe(true);
  });

  it('strictly enforces hard count bounding caps (15 files, 5 components, 5 owners, 5 decisions, 3 precedents)', async () => {
    // Generate oversize outputs
    const manyFiles = Array.from({ length: 30 }, (_, i) => ({
      f: { path: `src/file_${i}.ts` },
      c: { name: 'core' },
      downstream: { name: `downstream_${i}` },
    }));

    const manyOwners = Array.from({ length: 15 }, (_, i) => ({
      component: 'core',
      authorId: `author_${i}`,
      authorName: `Dev ${i}`,
      authoredCount: i + 1,
    }));

    const manyDecisions = Array.from({ length: 12 }, (_, i) => ({
      id: `DEC-${i}`,
      title: `Decision ${i}`,
      component: 'core',
      status: 'ACCEPTED',
    }));

    const manyPrecedents = Array.from({ length: 8 }, (_, i) => ({
      decision: { id: `PREC-${i}`, title: `Precedent ${i}` },
      score: 0.9 - i * 0.02, // All above 0.60
    }));

    const mockClient = {
      executeQuery: vi.fn().mockImplementation((_ws, queryName) => {
        if (queryName === 'blastRadius') {
          return Promise.resolve({
            raw: manyFiles,
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 30, edgeCount: 0, primaryIds: [] },
          });
        }
        if (queryName === 'whoKnows') {
          return Promise.resolve({
            raw: manyOwners,
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 15, edgeCount: 0, primaryIds: [] },
          });
        }
        if (queryName === 'constrainingDecisions') {
          return Promise.resolve({
            raw: manyDecisions,
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 12, edgeCount: 0, primaryIds: [] },
          });
        }
        if (queryName === 'precedentSearch') {
          return Promise.resolve({
            raw: manyPrecedents,
            graph: { nodes: [], edges: [] },
            evidence: { nodeCount: 8, edgeCount: 0, primaryIds: [] },
          });
        }
        return Promise.resolve({ raw: [], graph: { nodes: [], edges: [] }, evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] } });
      }),
    } as unknown as GatewayClient;

    const res = await dispatchRetrievalBundle(mockClient, 'ws-test', dummyScope);

    expect(res.status).toBe('SUCCESS');
    const bundle = res.bundle!;

    expect(bundle.touchedFiles.length).toBeLessThanOrEqual(15);
    expect(bundle.blastComponents.length).toBeLessThanOrEqual(5);
    expect(bundle.keyOwners.length).toBeLessThanOrEqual(5);
    expect(bundle.constrainingDecisions.length).toBeLessThanOrEqual(5);
    expect(bundle.precedents.length).toBeLessThanOrEqual(3);
  });

  it('triggers pre-narration short-circuit NO_GRAPH_DATA when retrieval is completely empty', async () => {
    const emptyScope: ResolvedScope = {
      files: [],
      components: [],
      queryVector: [],
      rawTask: 'Unknown concept',
      asOf: 1700000000,
    };

    const mockClient = {
      executeQuery: vi.fn().mockResolvedValue({
        raw: [],
        graph: { nodes: [], edges: [] },
        evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] },
      }),
    } as unknown as GatewayClient;

    const res = await dispatchRetrievalBundle(mockClient, 'ws-test', emptyScope);

    expect(res.status).toBe('NO_GRAPH_DATA');
    expect(res.bundle).toBeUndefined();
    expect(res.reason).toContain('No matching graph entities found');
  });
});

