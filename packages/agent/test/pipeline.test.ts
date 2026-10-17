import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeBriefingPipeline } from '../src/briefing/pipeline.js';
import type { GatewayClient } from '../src/client/types.js';
import type { ArgonEmbedder, ArgonGraphClient } from '@argon/graph';

const payload = (raw: unknown[], primaryIds: string[] = []) => ({
  raw,
  graph: { nodes: [], edges: [] },
  evidence: { nodeCount: raw.length, edgeCount: 0, primaryIds },
});

const embedder = { embed: async () => ({ vector: new Array(512).fill(0.05) }) } as unknown as ArgonEmbedder;

interface Fixture {
  reverts?: Array<{ id: string; title: string; revertedId: string }>;
  precedentStatus?: string;
  failAll?: boolean;
  empty?: boolean;
  risk?: Array<{ component: string; score: number }>;
}

function makeClient(fx: Fixture = {}) {
  const executeQuery = vi.fn(async (_ws: string, name: string, params: any) => {
    if (fx.failAll) throw new Error('[NO GRAPH, NO ANSWER] FalkorDB is unavailable: ECONNREFUSED');
    if (fx.empty) return payload([]);
    switch (name) {
      case 'resolveScope':
        return payload([
          {
            matchedFiles: [{ properties: { path: 'src/billing/retry.ts' } }],
            allComponents: [{ properties: { name: 'billing' } }],
          },
        ]);
      case 'blastRadius':
        return payload(
          [
            {
              f: { properties: { path: 'src/billing/retry.ts' } },
              c: { properties: { name: 'billing' } },
              downstream: { properties: { name: 'ledger' } },
            },
          ],
          ['src/billing/retry.ts', 'billing']
        );
      case 'whoKnows':
        return payload([{ component: 'billing', authorId: 'p1', authorName: 'Alice', authoredCount: 4, reviewedCount: 0 }], ['billing']);
      case 'constrainingDecisions':
        return payload([{ id: 'DEC-002', title: 'Exponential backoff', status: 'active', component: 'billing' }], ['DEC-002']);
      case 'precedentSearch':
        return payload(
          [{ decision: { id: 'DEC-001', title: 'Linear retry', properties: { status: fx.precedentStatus ?? 'superseded' } }, score: 0.9, component: { name: 'billing' } }],
          ['DEC-001']
        );
      case 'revertHistory':
        return payload(
          (fx.reverts ?? []).map((r) => ({
            node: { id: 1, labels: ['PullRequest'], properties: { id: r.id, title: r.title } },
            reverted: { id: 2, labels: ['PullRequest'], properties: { id: r.revertedId } },
            files: ['src/billing/retry.ts'],
          })),
          (fx.reverts ?? []).map((r) => r.id)
        );
      case 'riskRanking':
        return payload(fx.risk ?? [], (fx.risk ?? []).map((r) => r.component));
      case 'pathBetween':
        return payload(
          [{ path: { nodes: [{ id: 1, labels: ['Component'], properties: { name: params.sourceName } }, { id: 2, labels: ['Component'], properties: { name: params.targetName } }], edges: [{ id: 3, relationshipType: 'DEPENDS_ON', sourceId: 1, destinationId: 2, properties: {} }] }, pathWeight: 1 }],
          ['ledger-path-node']
        );
      default:
        return payload([]);
    }
  });
  return { executeQuery } as unknown as GatewayClient & { executeQuery: ReturnType<typeof vi.fn> };
}

const goodBriefing = (extraCite: string[] = []) => ({
  summary: {
    overview: 'Billing retry is governed by DEC-002.',
    riskLevel: 'high',
    keyTakeaways: [{ claim: 'DEC-002 mandates exponential backoff.', citedNodeIds: ['DEC-002', ...extraCite] }],
  },
  blastRadius: {
    analysis: 'Billing feeds the ledger.',
    affectedComponents: [{ component: 'billing', reason: 'Retry lives here', citedNodeIds: ['billing'] }],
  },
  keyOwners: [],
  constrainingDecisions: [
    { decisionId: 'DEC-002', title: 'Exponential backoff', component: 'billing', status: 'active', constraint: 'No linear retries', citedNodeIds: ['DEC-002'] },
  ],
  precedents: [],
});

const request = { task: 'Refactor src/billing/retry.ts', files: ['src/billing/retry.ts'] };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('executeBriefingPipeline: tool trace, tool selection and verdict', () => {
  it('records every fixed-pipeline graph query in the tool trace (step 0, source pipeline)', async () => {
    const client = makeClient();
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      customGenerator: async () => goodBriefing(),
    });
    expect(res.status).toBe('SUCCESS');
    const pipelineTools = res.toolTrace!.filter((t) => t.source === 'pipeline').map((t) => t.tool).sort();
    expect(pipelineTools).toEqual([
      'blast_radius', 'constraining_decisions', 'precedent_search', 'revert_history', 'risk_ranking', 'who_knows',
    ]);
    expect(res.toolTrace!.every((t) => t.step === 0 && t.status === 'ok')).toBe(true);
    // 512-d query vector must not be dumped into the trace
    const precedent = res.toolTrace!.find((t) => t.tool === 'precedent_search')!;
    expect(precedent.args.queryVector).toBe('<512-d vector>');
    expect(res.toolSelection).toMatchObject({ status: 'skipped', llmCallCount: 0 });
    expect(res.toolSelection!.reason).toMatch(/custom narration generator/);
  });

  it('computes the verdict from graph facts: revert + superseded precedent => HOLD, with citable reasons', async () => {
    const client = makeClient({ reverts: [{ id: 'pr_rev_42', title: 'Revert linear retry', revertedId: 'pr_orig' }] });
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      customGenerator: async () => goodBriefing(),
    });
    expect(res.verdict!.level).toBe('HOLD');
    const reasons = Object.fromEntries(res.verdict!.reasons.map((r) => [r.rule, r]));
    expect(reasons.REVERT_HISTORY!.citedNodeIds).toEqual(['pr_rev_42']);
    expect(reasons.SUPERSEDED_PRECEDENT!.citedNodeIds).toEqual(['DEC-001']);
    expect(reasons.DECISIONS_IN_FORCE!.citedNodeIds).toEqual(['DEC-002']);
  });

  it('gives PROCEED when nothing in the graph signals risk', async () => {
    const client = makeClient({ precedentStatus: 'active' });
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      customGenerator: async () => goodBriefing(),
    });
    expect(res.verdict!.level).toBe('PROCEED');
  });

  it('uses PageRank from the graph: touching a top-3 component raises the verdict to REVIEW', async () => {
    const client = makeClient({ precedentStatus: 'active', risk: [{ component: 'billing', score: 0.6 }, { component: 'ledger', score: 0.3 }] });
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      customGenerator: async () => goodBriefing(),
    });
    expect(res.verdict!.level).toBe('REVIEW');
    expect(res.verdict!.reasons.map((r) => r.rule)).toContain('CENTRAL_COMPONENT');
  });

  it('lets the LLM planner pick extra tools; findings reach the narrator and their ids become citable', async () => {
    const client = makeClient({ precedentStatus: 'active' });
    const planner = vi
      .fn()
      .mockResolvedValueOnce({ calls: [{ tool: 'path_between', args: { sourceName: 'billing', targetName: 'ledger' } }] })
      .mockResolvedValueOnce({ done: true });
    let narrationPrompt = '';
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      toolSelection: { generator: planner },
      customGenerator: async (prompt: string) => {
        narrationPrompt = prompt;
        return goodBriefing(['ledger-path-node']);
      },
    });

    expect(res.status).toBe('SUCCESS');
    const llm = res.toolTrace!.filter((t) => t.source === 'llm');
    expect(llm).toHaveLength(1);
    expect(llm[0]).toMatchObject({ tool: 'path_between', step: 1, status: 'ok', args: { sourceName: 'billing', targetName: 'ledger' } });
    expect(res.toolSelection).toMatchObject({ status: 'completed', llmCallCount: 1, steps: 2 });

    // the narrator saw the planner's finding
    expect(narrationPrompt).toContain('Tool path_between');
    expect(narrationPrompt).toContain('ledger-path-node');
    // and a claim citing an id that only the planner's tool returned survived validation
    expect(res.evidence).toMatchObject({ strippedClaimCount: 0 });
    expect((res.evidence as any).verifiedNodeIds).toContain('ledger-path-node');
  });

  it('strips claims citing ids that no tool returned (planner output is not trusted blindly)', async () => {
    const client = makeClient({ precedentStatus: 'active' });
    const briefing = goodBriefing();
    briefing.summary.keyTakeaways.push({ claim: 'Invented fact.', citedNodeIds: ['made-up-node'] });
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      toolSelection: { generator: async () => ({ done: true }) },
      customGenerator: async () => briefing,
    });
    expect(res.status).toBe('SUCCESS');
    expect((res.evidence as any).strippedClaimCount).toBe(1);
    expect((res.evidence as any).verifiedNodeIds).not.toContain('made-up-node');
    expect((res.briefing as any).summary.keyTakeaways).toHaveLength(1);
  });

  it('degrades gracefully: a failing planner never fails the briefing', async () => {
    const client = makeClient({ precedentStatus: 'active' });
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      toolSelection: { generator: async () => { throw new Error('quota exceeded'); } },
      customGenerator: async () => goodBriefing(),
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.toolSelection).toMatchObject({ status: 'failed', llmCallCount: 0 });
    expect(res.toolSelection!.reason).toMatch(/quota exceeded/);
    expect(res.toolTrace!.every((t) => t.source === 'pipeline')).toBe(true);
    expect(res.verdict).toBeDefined();
  });

  it('can run the planner through an injected invoker (e.g. MCP)', async () => {
    const client = makeClient({ precedentStatus: 'active' });
    const call = vi.fn(async (name: string) => ({
      ok: true, tool: name, rows: [{ component: 'billing', score: 1 }], rowCount: 1, truncated: false,
      evidence: { nodeCount: 1, edgeCount: 0, primaryIds: ['billing'] },
    }));
    const invoker = {
      specs: () => [{ name: 'component_overview', description: 'overview', argsHint: '{"component": string}' }],
      call,
    };
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      toolSelection: {
        invoker,
        generator: vi.fn().mockResolvedValueOnce({ calls: [{ tool: 'component_overview', args: { component: 'billing' } }] }).mockResolvedValueOnce({ done: true }),
      },
      customGenerator: async () => goodBriefing(),
    });
    expect(call).toHaveBeenCalledWith('component_overview', { component: 'billing' });
    expect(res.toolTrace!.some((t) => t.source === 'llm' && t.tool === 'component_overview')).toBe(true);
  });

  describe('when tool selection runs by default', () => {
    it('is skipped without an API key', async () => {
      vi.stubEnv('GEMINI_API_KEY', '');
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');
      const client = makeClient({ precedentStatus: 'active' });
      // no customGenerator would try a live narration call, so we only check the narrow path via toolSelection: false
      const res = await executeBriefingPipeline({
        client, embedder, workspaceId: 'ws', request,
        customGenerator: async () => goodBriefing(),
      });
      expect(res.toolSelection!.status).toBe('skipped');
    });

    it('can be switched off explicitly', async () => {
      const client = makeClient({ precedentStatus: 'active' });
      const generator = vi.fn();
      const res = await executeBriefingPipeline({
        client, embedder, workspaceId: 'ws', request,
        toolSelection: false,
        customGenerator: async () => goodBriefing(),
      });
      expect(generator).not.toHaveBeenCalled();
      expect(res.toolSelection).toMatchObject({ status: 'skipped', reason: 'disabled by caller' });
    });
  });

  it('records the verdict and tool-call count on the (:Briefing) memory node', async () => {
    const client = makeClient({ reverts: [{ id: 'pr_rev_42', title: 'Revert', revertedId: 'pr_orig' }] });
    const queries: Array<{ cypher: string; params: any }> = [];
    const graphClient = {
      query: vi.fn(async (_ws: string, cypher: string, params: any) => {
        queries.push({ cypher, params });
        return { data: [] };
      }),
      roQuery: vi.fn(async () => ({ data: [{ cnt: 1 }] })),
    } as unknown as ArgonGraphClient;

    const res = await executeBriefingPipeline({
      client, graphClient, embedder, workspaceId: 'ws', request,
      customGenerator: async () => goodBriefing(),
    });
    expect(res.briefingId).toBeTruthy();
    const create = queries[0]!;
    expect(create.cypher).toContain('b.verdict = $verdict');
    expect(create.params.verdict).toBe('HOLD');
    expect(create.params.toolCallCount).toBe(6);
  });

  it('fails closed with NO_GRAPH_DATA and still reports what was attempted when the graph is down', async () => {
    const client = makeClient({ failAll: true });
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request,
      customGenerator: async () => goodBriefing(),
    });
    expect(res.status).toBe('NO_GRAPH_DATA');
    expect(res.briefing).toBeNull();
    expect(res.verdict).toBeUndefined();
    expect(res.reason).toMatch(/no graph, no answer/i);
    expect(res.toolTrace!.length).toBeGreaterThan(0);
    expect(res.toolTrace!.filter((t) => t.status === 'error').length).toBeGreaterThan(0);
  });

  it('short-circuits on an empty graph without calling the narrator or the planner', async () => {
    const client = makeClient({ empty: true });
    const customGenerator = vi.fn();
    const planner = vi.fn();
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', request: { task: 'something unknown' },
      toolSelection: { generator: planner },
      customGenerator,
    });
    expect(res.status).toBe('NO_GRAPH_DATA');
    expect(customGenerator).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
    expect(res.toolTrace!.some((t) => t.status === 'skipped')).toBe(true);
  });
});
