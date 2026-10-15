import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient } from '../src/client';
import {
  toCytoscapeElements,
  resolveScope,
  blastRadius,
  riskRanking,
  whoKnows,
  constrainingDecisions,
  precedentSearch,
  pathBetween,
  componentOverview,
  ResolveScopeParamsSchema,
  BlastRadiusParamsSchema,
  RiskRankingParamsSchema,
  WhoKnowsParamsSchema,
  ConstrainingDecisionsParamsSchema,
  PrecedentSearchParamsSchema,
  PathBetweenParamsSchema,
  ComponentOverviewParamsSchema,
} from '../src';
import { seedTestGraph, FIXTURE_VEC_1, FIXTURE_VEC_2 } from './seed-fixture';

// Probe FalkorDB reachability at suite load time for graceful skips if offline
const isFalkorLive = await (async () => {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const reachable = await probe.ping();
    await probe.close();
    return reachable;
  } catch {
    return false;
  }
})();

describe('Offline Contracts & Cytoscape Transformer Suite', () => {
  describe('Zod Schema Input Validation Contracts', () => {
    it('validates ResolveScopeParams schema and defaults', () => {
      const parsed = ResolveScopeParamsSchema.parse({});
      expect(parsed.paths).toEqual([]);
      expect(parsed.names).toEqual([]);

      const custom = ResolveScopeParamsSchema.parse({
        paths: ['src/auth.ts'],
        names: ['Auth'],
      });
      expect(custom.paths).toEqual(['src/auth.ts']);
      expect(custom.names).toEqual(['Auth']);
    });

    it('validates BlastRadiusParams schema constraints', () => {
      expect(() => BlastRadiusParamsSchema.parse({ files: [] })).toThrow();
      const valid = BlastRadiusParamsSchema.parse({ files: ['src/auth.ts'] });
      expect(valid.files).toEqual(['src/auth.ts']);
      expect(valid.maxDepth).toBe(3);

      expect(() => BlastRadiusParamsSchema.parse({ files: ['a.ts'], maxDepth: 10 })).toThrow();
    });

    it('validates RiskRankingParams schema defaults and bounds', () => {
      const valid = RiskRankingParamsSchema.parse({});
      expect(valid.limit).toBe(10);
      expect(() => RiskRankingParamsSchema.parse({ limit: 0 })).toThrow();
      expect(() => RiskRankingParamsSchema.parse({ limit: 101 })).toThrow();
    });

    it('validates WhoKnowsParams schema requirements', () => {
      expect(() => WhoKnowsParamsSchema.parse({ components: [] })).toThrow();
      const valid = WhoKnowsParamsSchema.parse({ components: ['Auth'] });
      expect(valid.components).toEqual(['Auth']);
    });

    it('validates ConstrainingDecisionsParams timestamp and file requirements', () => {
      expect(() => ConstrainingDecisionsParamsSchema.parse({ files: [], asOf: 1000 })).toThrow();
      expect(() => ConstrainingDecisionsParamsSchema.parse({ files: ['a.ts'], asOf: -1 })).toThrow();
      const valid = ConstrainingDecisionsParamsSchema.parse({ files: ['a.ts'], asOf: 1700000 });
      expect(valid.asOf).toBe(1700000);
    });

    it('enforces strict 512-dimension vector constraint in PrecedentSearchParams', () => {
      const vec512 = new Array(512).fill(0.01);
      const valid = PrecedentSearchParamsSchema.parse({ queryVector: vec512 });
      expect(valid.queryVector.length).toBe(512);
      expect(valid.limit).toBe(5);

      // Rejects non-512 dimension vectors
      const vec768 = new Array(768).fill(0.01);
      expect(() => PrecedentSearchParamsSchema.parse({ queryVector: vec768 })).toThrow();
      const vec256 = new Array(256).fill(0.01);
      expect(() => PrecedentSearchParamsSchema.parse({ queryVector: vec256 })).toThrow();
    });

    it('validates PathBetweenParams and ComponentOverviewParams non-empty constraints', () => {
      expect(() => PathBetweenParamsSchema.parse({ sourceName: '', targetName: 'B' })).toThrow();
      expect(() => PathBetweenParamsSchema.parse({ sourceName: 'A', targetName: '' })).toThrow();
      const pathValid = PathBetweenParamsSchema.parse({ sourceName: 'A', targetName: 'B' });
      expect(pathValid.sourceName).toBe('A');

      expect(() => ComponentOverviewParamsSchema.parse({ component: '' })).toThrow();
      const compValid = ComponentOverviewParamsSchema.parse({ component: 'Auth' });
      expect(compValid.component).toBe('Auth');
    });
  });

  describe('Cytoscape Deduplication & Normalization Transformer', () => {
    it('produces normalized dual-payload with { raw, graph, evidence }', () => {
      const rawRecords = [
        {
          id: 'D-01',
          title: 'JWT Auth',
          status: 'superseded',
          component: 'Auth',
          sourceUrl: 'https://github.com/argon/repo/pull/10',
        },
      ];

      const payload = toCytoscapeElements(rawRecords);
      expect(payload).toHaveProperty('raw', rawRecords);
      expect(payload).toHaveProperty('graph');
      expect(payload).toHaveProperty('evidence');

      expect(payload.graph.nodes.length).toBe(2); // D-01 and Auth
      expect(payload.graph.edges.length).toBe(1); // D-01 -> GOVERNS -> Auth
      expect(payload.evidence.nodeCount).toBe(2);
      expect(payload.evidence.edgeCount).toBe(1);
      expect(payload.evidence.primaryIds).toContain('D-01');
    });

    it('strictly deduplicates nodes and edges across multiple records', () => {
      // Simulate multiple records containing overlapping nodes and identical edges
      const duplicateRecords = [
        {
          id: 'D-01',
          title: 'JWT Auth',
          status: 'superseded',
          component: 'Auth',
        },
        {
          id: 'D-01',
          title: 'JWT Auth',
          status: 'superseded',
          component: 'Auth',
        },
        {
          component: 'Auth',
          score: 0.85,
        },
      ];

      const payload = toCytoscapeElements(duplicateRecords);
      // 'D-01' and 'Auth' must each only appear ONCE in nodes
      const nodeIds = payload.graph.nodes.map((n) => n.data.id);
      expect(nodeIds.filter((id) => id === 'D-01').length).toBe(1);
      expect(nodeIds.filter((id) => id === 'Auth').length).toBe(1);
      expect(payload.graph.nodes.length).toBe(2);

      // 'D-01->GOVERNS->Auth' must only appear ONCE in edges
      expect(payload.graph.edges.length).toBe(1);
    });

    it('correctly maps FalkorDB Node, Edge, and Path objects with internal IDs', () => {
      const mockFileNode = {
        id: 1,
        labels: ['File'],
        properties: { path: 'src/auth.ts' },
      };
      const mockCompNode = {
        id: 2,
        labels: ['Component'],
        properties: { name: 'Auth' },
      };
      const mockEdge = {
        id: 10,
        relationshipType: 'IN_COMPONENT',
        sourceId: 1,
        destinationId: 2,
        properties: {},
      };
      const mockPath = {
        nodes: [mockFileNode, mockCompNode],
        edges: [mockEdge],
      };

      const payload = toCytoscapeElements([{ path: mockPath }]);
      expect(payload.graph.nodes.length).toBe(2);
      expect(payload.graph.nodes.map((n) => n.data.id)).toContain('src/auth.ts');
      expect(payload.graph.nodes.map((n) => n.data.id)).toContain('Auth');

      expect(payload.graph.edges.length).toBe(1);
      const edge = payload.graph.edges[0].data;
      expect(edge.source).toBe('src/auth.ts');
      expect(edge.target).toBe('Auth');
      expect(edge.label).toBe('IN_COMPONENT');
    });

    it('synthesizes missing endpoint nodes to prevent Cytoscape renderer crashes', () => {
      const orphanEdge = {
        id: 99,
        relationshipType: 'DEPENDS_ON',
        sourceId: 101, // node 101 not in nodes list
        destinationId: 102, // node 102 not in nodes list
        properties: {},
      };

      const payload = toCytoscapeElements([{ edge: orphanEdge }]);
      expect(payload.graph.edges.length).toBe(1);
      const nodeIds = payload.graph.nodes.map((n) => n.data.id);
      expect(nodeIds).toContain('101');
      expect(nodeIds).toContain('102');
    });

    it('transforms WhoKnows, ComponentOverview, and RiskRanking records', () => {
      const whoKnowsRecord = {
        component: 'Auth',
        authorId: 'alice_hash',
        authorName: 'Alice',
        authoredCount: 3,
        reviewerId: 'bob_hash',
        reviewerName: 'Bob',
        reviewedCount: 5,
      };

      const payload = toCytoscapeElements([whoKnowsRecord]);
      const nodeIds = payload.graph.nodes.map((n) => n.data.id);
      expect(nodeIds).toContain('Auth');
      expect(nodeIds).toContain('alice_hash');
      expect(nodeIds).toContain('bob_hash');
      expect(payload.graph.edges.length).toBe(2);

      const overviewRecord = {
        name: 'Database',
        fileCount: 5,
        decisionCount: 3,
        dependencies: ['Storage', 'Network'],
      };

      const overviewPayload = toCytoscapeElements([overviewRecord]);
      const overviewNodes = overviewPayload.graph.nodes.map((n) => n.data.id);
      expect(overviewNodes).toContain('Database');
      expect(overviewNodes).toContain('Storage');
      expect(overviewNodes).toContain('Network');
      expect(overviewPayload.graph.edges.length).toBe(2);
    });
  });
});

describe('FalkorDB 8 Named Queries Integration', () => {
  describe.skipIf(!isFalkorLive)('Live FalkorDB Query Assertions', () => {
    const testWorkspace = `test_queries_${Date.now()}`;
    let client: ArgonGraphClient;

    beforeAll(async () => {
      client = new ArgonGraphClient();
      await client.connect();
      await seedTestGraph(client, testWorkspace);
    });

    afterAll(async () => {
      if (client) {
        try {
          const graph = client.selectGraph(testWorkspace);
          await graph.delete();
        } catch {
          // ignore cleanup errors
        }
        await client.close();
      }
    });

    it('01: resolveScope resolves paths to File and Component nodes', async () => {
      const res = await resolveScope(client, testWorkspace, {
        paths: ['src/auth.ts'],
        names: [],
      });

      expect(res.raw.length).toBeGreaterThanOrEqual(1);
      const row = res.raw[0];
      expect(row.matchedFiles.length).toBe(1);
      const fileNode = row.matchedFiles[0] as any;
      expect(fileNode.properties.path).toBe('src/auth.ts');

      const compNodes = row.allComponents as any[];
      const compNames = compNodes.map((c) => c.properties.name);
      expect(compNames).toContain('Auth');

      expect(res.graph.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('02: blastRadius traverses dependency chain up to 3 hops', async () => {
      const res = await blastRadius(client, testWorkspace, {
        files: ['src/auth.ts'],
        maxDepth: 3,
      });

      expect(res.raw.length).toBeGreaterThanOrEqual(1);
      // Downstream components should include Database and Storage
      const downstreamNames = res.raw
        .map((r: any) => r.downstream?.properties?.name)
        .filter(Boolean);

      expect(downstreamNames).toContain('Database');
      expect(downstreamNames).toContain('Storage');

      const nodeIds = res.graph.nodes.map((n) => n.data.id);
      expect(nodeIds).toContain('Auth');
      expect(nodeIds).toContain('Database');
      expect(nodeIds).toContain('Storage');
    });

    it('03: riskRanking computes PageRank over component dependencies', async () => {
      const res = await riskRanking(client, testWorkspace, { limit: 10 });
      expect(res.raw.length).toBeGreaterThanOrEqual(1);

      // Components should be ordered by PageRank score
      for (const row of res.raw) {
        expect(typeof row.component).toBe('string');
        expect(typeof row.score).toBe('number');
      }

      // Storage receives dependencies from Database, which receives from Auth.
      // Therefore, Storage or Database must have higher score than Auth.
      const scores = new Map(res.raw.map((r) => [r.component, r.score]));
      expect(scores.has('Storage')).toBe(true);
      expect(scores.has('Database')).toBe(true);
      expect(scores.has('Auth')).toBe(true);
      expect(scores.get('Storage')!).toBeGreaterThanOrEqual(scores.get('Auth')!);
    });

    it('04: whoKnows evaluates author and reviewer counts for component', async () => {
      const res = await whoKnows(client, testWorkspace, { components: ['Auth'] });
      expect(res.raw.length).toBeGreaterThanOrEqual(1);

      const aliceRow = res.raw.find((r) => r.authorName === 'Alice' || r.authorId === 'alice_hash');
      expect(aliceRow).toBeDefined();
      expect(aliceRow?.component).toBe('Auth');
      expect(aliceRow?.authoredCount).toBe(1);
    });

    it('05: constrainingDecisions evaluates temporal validity (past vs present)', async () => {
      // Past query at asOf = 1500: D-01 is active (valid_from: 1000, valid_to: 2000), D-02 not yet started (valid_from: 2001)
      const pastRes = await constrainingDecisions(client, testWorkspace, {
        files: ['src/auth.ts'],
        asOf: 1500,
      });

      const pastIds = pastRes.raw.map((d) => d.id);
      expect(pastIds).toContain('D-01');
      expect(pastIds).not.toContain('D-02');

      // Present query at asOf = 3000: D-01 is superseded/expired (valid_to: 2000), D-02 is active
      const presentRes = await constrainingDecisions(client, testWorkspace, {
        files: ['src/auth.ts'],
        asOf: 3000,
      });

      const presentIds = presentRes.raw.map((d) => d.id);
      expect(presentIds).not.toContain('D-01');
      expect(presentIds).toContain('D-02');
    });

    it('06: precedentSearch performs 512-d vector cosine similarity and expands graph', async () => {
      const res = await precedentSearch(client, testWorkspace, {
        queryVector: FIXTURE_VEC_1,
        limit: 5,
      });

      expect(res.raw.length).toBeGreaterThanOrEqual(1);
      const topMatch = res.raw[0];
      expect(topMatch.score).toBeGreaterThanOrEqual(-1.0);
      expect(topMatch.score).toBeLessThanOrEqual(1.0);

      const decisionNode = topMatch.decision as any;
      expect(decisionNode.properties.id).toBe('D-01');
      // Cosine similarity between unit vector 1 and itself is approximately 1.0
      expect(topMatch.score).toBeCloseTo(1.0, 1);

      const res2 = await precedentSearch(client, testWorkspace, {
        queryVector: FIXTURE_VEC_2,
        limit: 5,
      });
      expect(res2.raw.length).toBeGreaterThanOrEqual(1);
      const decisionNode2 = res2.raw[0].decision as any;
      expect(decisionNode2.properties.id).toBe('D-02');
    });

    it('07: pathBetween finds shortest path between Auth and Storage via algo.SPpaths', async () => {
      const res = await pathBetween(client, testWorkspace, {
        sourceName: 'Auth',
        targetName: 'Storage',
      });

      expect(res.raw.length).toBe(1);
      const row = res.raw[0];
      expect(row.pathWeight).toBeGreaterThanOrEqual(1);

      // Verify the path connects Auth -> Database -> Storage
      const pathObj = row.path as any;
      expect(pathObj.nodes.length).toBe(3); // Auth, Database, Storage
      const nodeNames = pathObj.nodes.map((n: any) => n.properties.name);
      expect(nodeNames).toEqual(['Auth', 'Database', 'Storage']);
    });

    it('08: componentOverview aggregates file counts, decisions, and dependencies', async () => {
      const res = await componentOverview(client, testWorkspace, { component: 'Auth' });
      expect(res.raw.length).toBe(1);

      const overview = res.raw[0];
      expect(overview.name).toBe('Auth');
      expect(overview.fileCount).toBe(2); // src/auth.ts, src/session.ts
      expect(overview.decisionCount).toBe(2); // D-01, D-02
      expect(overview.dependencies).toContain('Database');
    });
  });
});
