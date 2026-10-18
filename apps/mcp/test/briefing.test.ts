import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient, executeBriefingPipeline } from '@argon/agent';
import { createMcpToolInvoker } from '../src/invoker.js';
import {
  connectInMemory,
  directOptions,
  fakeEmbedder,
  isFalkorLive,
  seedWorkspace,
  textOf,
} from './harness.js';

const live = await isFalkorLive();

const narration = (extraCites: string[] = []) => ({
  summary: {
    overview: 'Auth moved from JWT to session cookies (D-02).',
    riskLevel: 'high',
    keyTakeaways: [{ claim: 'D-02 supersedes D-01 for Auth.', citedNodeIds: ['D-02', ...extraCites] }],
  },
  blastRadius: {
    analysis: 'Auth depends on Database which depends on Storage.',
    affectedComponents: [{ component: 'Auth', reason: 'Owns the files', citedNodeIds: ['Auth'] }],
  },
  keyOwners: [],
  constrainingDecisions: [
    { decisionId: 'D-02', title: 'Session Cookies', component: 'Auth', status: 'active', constraint: 'Use cookies', citedNodeIds: ['D-02'] },
  ],
  precedents: [],
});

describe.skipIf(!live)('Argon MCP: generate_briefing, tool selection over MCP (live FalkorDB)', () => {
  const ws = `test_mcp_brief_${Date.now()}`;
  let graph: ArgonGraphClient;

  beforeAll(async () => {
    graph = new ArgonGraphClient();
    await graph.connect();
    await seedWorkspace(graph, ws);
  });

  afterAll(async () => {
    try {
      await graph.selectGraph(ws).delete();
    } catch {
      // ignore
    }
    await graph.close();
  });

  it('generate_briefing returns a cited briefing, a graph-derived HOLD verdict and the full tool trace', async () => {
    const planner = vi
      .fn()
      .mockResolvedValueOnce({ calls: [{ tool: 'path_between', args: { sourceName: 'Auth', targetName: 'Storage' } }] })
      .mockResolvedValueOnce({ done: true });
    let narrationPrompt = '';
    const mcp = await connectInMemory(
      directOptions(graph, {
        toolSelection: { generator: planner },
        briefingGenerator: async (prompt) => {
          narrationPrompt = prompt;
          return narration(['Storage']);
        },
      })
    );
    try {
      const res: any = await mcp.client.callTool({
        name: 'generate_briefing',
        arguments: { workspaceId: ws, task: 'Replace the JWT logic in src/auth.ts', files: ['src/auth.ts'] },
      });
      expect(res.isError).toBeFalsy();
      const out = res.structuredContent;
      expect(out.status).toBe('SUCCESS');
      expect(out.briefing.summary.keyTakeaways[0].citedNodeIds).toEqual(['D-02', 'Storage']);
      expect(out.evidence.strippedClaimCount).toBe(0);

      // verdict is derived from real graph facts
      expect(out.verdict.level).toBe('HOLD');
      const rules = out.verdict.reasons.map((r: any) => r.rule);
      expect(rules).toEqual(
        expect.arrayContaining(['REVERT_HISTORY', 'SUPERSEDED_PRECEDENT', 'CENTRAL_COMPONENT', 'DECISIONS_IN_FORCE'])
      );
      const revert = out.verdict.reasons.find((r: any) => r.rule === 'REVERT_HISTORY');
      expect(revert.citedNodeIds).toEqual(['pr_rev']);
      const superseded = out.verdict.reasons.find((r: any) => r.rule === 'SUPERSEDED_PRECEDENT');
      expect(superseded.citedNodeIds).toEqual(['D-01']);

      // trace: 6 fixed-pipeline queries + the planner's path_between, and the two counterfactual_impact
      // lookups the pipeline itself makes to annotate the learning path of that path_between
      const trace = out.toolTrace as any[];
      expect(trace.filter((t) => t.source === 'pipeline').map((t) => t.tool).sort()).toEqual([
        'blast_radius', 'constraining_decisions', 'counterfactual_impact', 'counterfactual_impact',
        'precedent_search', 'revert_history', 'risk_ranking', 'who_knows',
      ]);
      expect(out.learningPaths).toHaveLength(1);
      expect(out.learningPaths[0].hops.map((h: any) => h.component)).toEqual(['Auth', 'Database', 'Storage']);
      const llm = trace.filter((t) => t.source === 'llm');
      expect(llm).toHaveLength(1);
      expect(llm[0]).toMatchObject({ tool: 'path_between', status: 'ok', rowCount: 1 });
      expect(out.toolSelection).toMatchObject({ status: 'completed', llmCallCount: 1 });

      // the narrator was shown the planner's graph finding and the PageRank / revert evidence
      expect(narrationPrompt).toContain('Tool path_between');
      expect(narrationPrompt).toContain('pr_rev');
      expect(narrationPrompt).toMatch(/Rank \d by PageRank/);

      // write-back memory carries the verdict
      const rows = (
        await graph.roQuery(ws, 'MATCH (b:Briefing {id: $id}) RETURN b.verdict AS v, b.tool_call_count AS n', { id: out.briefingId })
      ).data as any[];
      // 6 fixed queries + path_between + the 2 learning-path annotation lookups
      expect(rows[0]).toEqual({ v: 'HOLD', n: 9 });
    } finally {
      await mcp.close();
    }
  });

  it('generate_briefing refuses (isError) when the scope has no graph data', async () => {
    const orthogonal = new Array(512).fill(0);
    orthogonal[300] = 1;
    const mcp = await connectInMemory(
      directOptions(graph, {
        embedder: { embed: async () => ({ vector: orthogonal }) },
        briefingGenerator: async () => {
          throw new Error('narrator must not be called without graph data');
        },
      })
    );
    try {
      const res: any = await mcp.client.callTool({
        name: 'generate_briefing',
        arguments: { workspaceId: ws, task: 'zzz qqq unrelated' },
      });
      expect(res.isError).toBe(true);
      expect(res.structuredContent.status).toBe('NO_GRAPH_DATA');
      expect(res.structuredContent.briefing).toBeNull();
      expect(res.structuredContent.verdict).toBeUndefined();
      expect(JSON.parse(textOf(res)).status).toBe('NO_GRAPH_DATA');
    } finally {
      await mcp.close();
    }
  });

  it('generate_briefing refuses when the narration cites nothing verifiable', async () => {
    const mcp = await connectInMemory(
      directOptions(graph, {
        briefingGenerator: async () => ({
          ...narration(),
          summary: {
            overview: 'Made up.',
            riskLevel: 'low',
            keyTakeaways: [{ claim: 'Invented.', citedNodeIds: ['ghost-node'] }],
          },
          blastRadius: { analysis: 'none', affectedComponents: [] },
          constrainingDecisions: [],
        }),
      })
    );
    try {
      const res: any = await mcp.client.callTool({
        name: 'generate_briefing',
        arguments: { workspaceId: ws, task: 'Refactor src/auth.ts', files: ['src/auth.ts'] },
      });
      expect(res.isError).toBe(true);
      expect(res.structuredContent.status).toBe('CITATION_INTEGRITY_FAILURE');
      expect(res.structuredContent.briefing).toBeNull();
    } finally {
      await mcp.close();
    }
  });

  describe('agent tool selection through MCP', () => {
    it('the invoker only offers planner-selectable tools that the server advertises', async () => {
      const mcp = await connectInMemory(directOptions(graph));
      try {
        const invoker = await createMcpToolInvoker(mcp.client, ws);
        const names = invoker.specs().map((s) => s.name).sort();
        expect(names).toEqual([
          'blast_radius', 'component_overview', 'constraining_decisions', 'counterfactual_impact', 'path_between',
          'precedent_search', 'revert_history', 'risk_ranking', 'who_knows',
        ]);
        for (const forbidden of ['generate_briefing', 'record_outcome', 'list_workspaces', 'resolve_scope']) {
          expect(names).not.toContain(forbidden);
          const res = await invoker.call(forbidden, {});
          expect(res.ok).toBe(false);
        }
      } finally {
        await mcp.close();
      }
    });

    it('the LLM planner picks tools and every call is a real MCP tools/call', async () => {
      const mcp = await connectInMemory(directOptions(graph));
      const callSpy = vi.spyOn(mcp.client, 'callTool');
      try {
        const invoker = await createMcpToolInvoker(mcp.client, ws);
        const planner = vi
          .fn()
          .mockResolvedValueOnce({
            calls: [
              { tool: 'path_between', args: { sourceName: 'Auth', targetName: 'Storage' } },
              { tool: 'run_cypher', args: { query: 'MATCH (n) DETACH DELETE n' } },
            ],
          })
          .mockResolvedValueOnce({ calls: [{ tool: 'component_overview', args: { component: 'Database' } }] })
          .mockResolvedValueOnce({ done: true });

        const res = await executeBriefingPipeline({
          client: new DirectGraphGatewayClient(graph),
          graphClient: graph,
          embedder: fakeEmbedder as any,
          workspaceId: ws,
          request: { task: 'How does auth reach storage? Refactor src/auth.ts', files: ['src/auth.ts'] },
          toolSelection: { invoker, generator: planner },
          customGenerator: async () => narration(['Database']),
        });

        expect(res.status).toBe('SUCCESS');
        const llm = res.toolTrace!.filter((t) => t.source === 'llm');
        expect(llm.map((t) => `${t.step}:${t.tool}:${t.status}`).sort()).toEqual([
          '1:path_between:ok',
          '1:run_cypher:rejected',
          '2:component_overview:ok',
        ]);
        // exactly the two accepted calls went over MCP, with the workspace injected
        expect(callSpy.mock.calls.map((c) => (c[0] as any).name)).toEqual(['path_between', 'component_overview']);
        expect((callSpy.mock.calls[0]![0] as any).arguments).toEqual({
          workspaceId: ws, sourceName: 'Auth', targetName: 'Storage',
        });
        // graph still intact: the rejected "run_cypher" never executed
        const count = (await graph.roQuery(ws, 'MATCH (n:Component) RETURN count(n) AS n')).data as any[];
        expect(count[0].n).toBe(3);
        expect(res.toolSelection).toMatchObject({ status: 'completed', llmCallCount: 2 });
      } finally {
        await mcp.close();
      }
    });

    it('MCP-level errors (bad arguments) become traced errors, not crashes', async () => {
      const mcp = await connectInMemory(directOptions(graph));
      try {
        const invoker = await createMcpToolInvoker(mcp.client, ws);
        const res = await invoker.call('path_between', { sourceName: 'only-source' });
        expect(res.ok).toBe(false);
        expect(res.error).toBeTruthy();
      } finally {
        await mcp.close();
      }
    });
  });
});
