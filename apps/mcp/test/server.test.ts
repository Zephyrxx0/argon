import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient, ARGON_TOOLS } from '@argon/agent';
import {
  connectInMemory,
  directOptions,
  isFalkorLive,
  seedWorkspace,
  textOf,
  type Connected,
} from './harness.js';

const live = await isFalkorLive();

describe.skipIf(!live)('Argon MCP server (in-memory client, live FalkorDB)', () => {
  const ws = `test_mcp_${Date.now()}`;
  let graph: ArgonGraphClient;
  let mcp: Connected;

  beforeAll(async () => {
    graph = new ArgonGraphClient();
    await graph.connect();
    await seedWorkspace(graph, ws);
    mcp = await connectInMemory(directOptions(graph));
  });

  afterAll(async () => {
    await mcp?.close();
    try {
      await graph.selectGraph(ws).delete();
    } catch {
      // ignore
    }
    await graph.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) =>
    mcp.client.callTool({ name, arguments: { workspaceId: ws, ...args } });
  const out = (res: any) => res.structuredContent as any;

  describe('discovery', () => {
    it('advertises every locked query as a read-only tool plus briefing, write-back and discovery tools', async () => {
      const { tools } = await mcp.client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(
        [
          ...ARGON_TOOLS.map((t) => t.name),
          'generate_briefing',
          'list_workspaces',
          'record_outcome',
        ].sort()
      );
      expect(ARGON_TOOLS).toHaveLength(9);

      for (const def of ARGON_TOOLS) {
        const tool = tools.find((t) => t.name === def.name)!;
        expect(tool.annotations?.readOnlyHint).toBe(true);
        expect(tool.description).toBeTruthy();
        expect(Object.keys(tool.inputSchema.properties ?? {})).toContain('workspaceId');
      }
      expect(tools.find((t) => t.name === 'record_outcome')!.annotations?.readOnlyHint).toBe(false);
      expect(tools.find((t) => t.name === 'generate_briefing')!.annotations?.readOnlyHint).toBe(false);
    });

    it('exposes no free-form Cypher tool', async () => {
      const { tools } = await mcp.client.listTools();
      expect(tools.some((t) => /cypher|query$|raw/i.test(t.name))).toBe(false);
    });

    it('list_workspaces includes the seeded workspace', async () => {
      const res: any = await mcp.client.callTool({ name: 'list_workspaces', arguments: {} });
      expect(res.isError).toBeFalsy();
      expect(out(res).workspaces).toContain(ws);
    });
  });

  describe('graph query tools return real FalkorDB results', () => {
    it('resolve_scope maps a path and a name to graph entities', async () => {
      const res = out(await call('resolve_scope', { paths: ['src/auth.ts'], names: ['Database'] }));
      expect(res.ok).toBe(true);
      expect(res.rowCount).toBe(1);
      const row = res.rows[0];
      expect(row.matchedFiles.map((f: any) => f.path)).toEqual(['src/auth.ts']);
      expect(row.allComponents.map((c: any) => c.name).sort()).toEqual(['Auth', 'Database']);
    });

    it('blast_radius follows DEPENDS_ON multi-hop and reports citable ids', async () => {
      const res = out(await call('blast_radius', { files: ['src/auth.ts'], maxDepth: 3 }));
      expect(res.ok).toBe(true);
      const downstream = res.rows
        .map((r: any) => r.downstream?._id)
        .filter(Boolean)
        .sort();
      expect(downstream).toEqual(['Database', 'Storage']);
      expect(res.evidence.primaryIds).toEqual(expect.arrayContaining(['src/auth.ts', 'Auth']));
    });

    it('blast_radius honours maxDepth (1 hop reaches only Database)', async () => {
      const res = out(await call('blast_radius', { files: ['src/auth.ts'], maxDepth: 1 }));
      const downstream = res.rows.map((r: any) => r.downstream?._id).filter(Boolean);
      expect(downstream).toEqual(['Database']);
    });

    it('risk_ranking runs PageRank: the most depended-upon component ranks first', async () => {
      const res = out(await call('risk_ranking', { limit: 3 }));
      expect(res.ok).toBe(true);
      expect(res.rows.map((r: any) => r.component)).toEqual(['Storage', 'Database', 'Auth']);
      const scores = res.rows.map((r: any) => r.score);
      expect(scores[0]).toBeGreaterThan(scores[1]);
      expect(scores[1]).toBeGreaterThan(scores[2]);
    });

    it('path_between returns the shortest dependency path', async () => {
      const res = out(await call('path_between', { sourceName: 'Auth', targetName: 'Storage' }));
      expect(res.ok).toBe(true);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].path._path).toEqual(['Auth', 'Database', 'Storage']);
      expect(res.rows[0].path.length).toBe(2);
    });

    it('path_between returns zero rows (not an error) when no path exists', async () => {
      const res = out(await call('path_between', { sourceName: 'Storage', targetName: 'Auth' }));
      expect(res.ok).toBe(true);
      expect(res.rowCount).toBe(0);
    });

    it('who_knows attributes authorship', async () => {
      const res = out(await call('who_knows', { components: ['Auth'] }));
      const alice = res.rows.find((r: any) => r.authorId === 'alice_hash');
      expect(alice).toBeTruthy();
      expect(alice.authorName).toBe('Alice');
      expect(alice.authoredCount).toBe(1);
    });

    it('constraining_decisions is temporal: asOf=1500 sees D-01, default (now) sees only D-02', async () => {
      const past = out(await call('constraining_decisions', { files: ['src/auth.ts'], asOf: 1500 }));
      expect(past.rows.map((r: any) => r.id)).toEqual(['D-01']);

      const now = out(await call('constraining_decisions', { files: ['src/auth.ts'] }));
      const ids = new Set(now.rows.map((r: any) => r.id));
      expect(ids.has('D-02')).toBe(true);
      expect(ids.has('D-01')).toBe(false);
    });

    it('precedent_search embeds the text and returns the nearest decision first, with status', async () => {
      const res = out(await call('precedent_search', { query: 'use JWT tokens for auth', limit: 2 }));
      expect(res.ok).toBe(true);
      expect(res.rows[0].decision._id).toBe('D-01');
      expect(res.rows[0].decision.status).toBe('superseded');
      expect(res.rows[0].score).toBeGreaterThan(0.99);
      // embeddings must never leak into tool output
      expect(JSON.stringify(res)).not.toContain('embedding');
      expect(res.rows[0].component._id).toBe('Auth');
    });

    it('component_overview summarises files, decisions and dependencies', async () => {
      const res = out(await call('component_overview', { component: 'Auth' }));
      expect(res.rows[0]).toMatchObject({ name: 'Auth', fileCount: 2, decisionCount: 2 });
      expect(res.rows[0].dependencies).toEqual(['Database']);
    });

    it('revert_history returns the revert and the change it reverted', async () => {
      const res = out(await call('revert_history', { files: ['src/auth.ts', 'src/db.ts'] }));
      expect(res.ok).toBe(true);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].node._id).toBe('pr_rev');
      expect(res.rows[0].reverted._id).toBe('pr_orig');
      expect(res.rows[0].files).toEqual(['src/auth.ts']);
      expect(res.evidence.primaryIds).toContain('pr_rev');
    });

    it('is also reachable with snake_case JSON through the text content block', async () => {
      const res: any = await call('risk_ranking', { limit: 1 });
      const parsed = JSON.parse(textOf(res));
      expect(parsed.rows[0].component).toBe('Storage');
    });
  });

  describe('input validation and error handling (fail closed)', () => {
    it('rejects invalid arguments with isError instead of running a query', async () => {
      const res: any = await call('blast_radius', { files: [] });
      expect(res.isError).toBe(true);
    });

    it('rejects a malicious workspaceId', async () => {
      const res: any = await mcp.client.callTool({
        name: 'risk_ranking',
        arguments: { workspaceId: 'x"; MATCH (n) DETACH DELETE n //', limit: 1 },
      });
      expect(res.isError).toBe(true);
    });

    it('requires a workspaceId when no default is configured', async () => {
      const res: any = await mcp.client.callTool({ name: 'risk_ranking', arguments: { limit: 1 } });
      expect(res.isError).toBe(true);
      expect(textOf(res)).toMatch(/workspaceId is required/);
    });

    it('is read-only: query tools never modify the graph', async () => {
      const before = (await graph.roQuery(ws, 'MATCH (n) RETURN count(n) AS n')).data as any[];
      await call('blast_radius', { files: ['src/auth.ts'] });
      await call('risk_ranking', { limit: 3 });
      await call('revert_history', { files: ['src/auth.ts'] });
      const after = (await graph.roQuery(ws, 'MATCH (n) RETURN count(n) AS n')).data as any[];
      expect(after[0].n).toBe(before[0].n);
    });

    it('uses the default workspace when the call omits workspaceId', async () => {
      const withDefault = await connectInMemory(directOptions(graph, { defaultWorkspaceId: ws }));
      try {
        const res: any = await withDefault.client.callTool({ name: 'risk_ranking', arguments: { limit: 1 } });
        expect(res.isError).toBeFalsy();
        expect(res.structuredContent.rows[0].component).toBe('Storage');
      } finally {
        await withDefault.close();
      }
    });

    it('answers "NO GRAPH, NO ANSWER" when FalkorDB is unreachable', async () => {
      const dead = new ArgonGraphClient({ url: 'falkor://localhost:6399', defaultTimeoutMs: 800 });
      const deadMcp = await connectInMemory({
        client: new DirectGraphGatewayClient(dead),
        graphClient: dead,
        embedder: undefined,
        defaultWorkspaceId: ws,
      });
      try {
        for (const [name, args] of [
          ['blast_radius', { files: ['src/auth.ts'] }],
          ['risk_ranking', { limit: 3 }],
          ['list_workspaces', {}],
        ] as const) {
          const res: any = await deadMcp.client.callTool({ name, arguments: args as any });
          expect(res.isError, name).toBe(true);
          expect(textOf(res), name).toMatch(/NO GRAPH, NO ANSWER/);
        }
        const briefing: any = await deadMcp.client.callTool({
          name: 'generate_briefing',
          arguments: { task: 'Refactor src/auth.ts', files: ['src/auth.ts'] },
        });
        expect(briefing.isError).toBe(true);
      } finally {
        await deadMcp.close();
        await dead.close();
      }
    });

    it('precedent_search reports an error when no embedder is configured', async () => {
      const noEmbed = await connectInMemory(directOptions(graph, { embedder: undefined }));
      try {
        const res: any = await noEmbed.client.callTool({
          name: 'precedent_search',
          arguments: { workspaceId: ws, query: 'anything' },
        });
        expect(res.isError).toBe(true);
        expect(textOf(res)).toMatch(/embedder/);
      } finally {
        await noEmbed.close();
      }
    });
  });

  describe('record_outcome (write-back memory)', () => {
    it('creates a Briefing node with CITES and ABOUT edges to real nodes only', async () => {
      const res: any = await call('record_outcome', {
        task: 'Replace JWT with sessions',
        summary: 'Moved to session cookies per D-02',
        citedNodeIds: ['D-02', 'does-not-exist'],
        affectedComponents: ['Auth'],
        verdict: 'REVIEW',
      });
      expect(res.isError).toBeFalsy();
      const id = res.structuredContent.briefingId as string;
      expect(id).toBeTruthy();

      const nodes = (
        await graph.roQuery(
          ws,
          `MATCH (b:Briefing {id: $id})
           OPTIONAL MATCH (b)-[:CITES]->(c)
           OPTIONAL MATCH (b)-[:ABOUT]->(a:Component)
           RETURN b.verdict AS verdict, collect(DISTINCT c.id) AS cites, collect(DISTINCT a.name) AS about`,
          { id }
        )
      ).data as any[];
      expect(nodes[0].verdict).toBe('REVIEW');
      expect(nodes[0].cites).toEqual(['D-02']);
      expect(nodes[0].about).toEqual(['Auth']);
    });

    it('rejects an invalid verdict value', async () => {
      const res: any = await call('record_outcome', { task: 't', summary: 's', verdict: 'YOLO' });
      expect(res.isError).toBe(true);
    });
  });
});
