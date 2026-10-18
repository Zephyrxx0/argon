import { describe, it, expect, vi } from 'vitest';
import {
  annotationsFromImpact,
  assembleLearningPaths,
  buildLearningPath,
  pathComponents,
} from '../src/briefing/learning-path.js';
import { executeBriefingPipeline } from '../src/briefing/pipeline.js';
import { buildPlannerPrompt } from '../src/tools/planner.js';
import type { GatewayClient } from '../src/client/types.js';
import type { ToolOutput } from '../src/tools/toolbox.js';
import type { ToolTraceEntry } from '../src/tools/trace.js';
import type { ArgonEmbedder } from '@argon/graph';

const payload = (raw: unknown[], primaryIds: string[] = []) => ({
  raw,
  graph: { nodes: [], edges: [] },
  evidence: { nodeCount: raw.length, edgeCount: 0, primaryIds },
});
const embedder = { embed: async () => ({ vector: new Array(512).fill(0.05) }) } as unknown as ArgonEmbedder;

// web-frontend -> citation-verifier -> query-engine -> graph-client (each hop depends on the next)
const WALK = ['web-frontend', 'citation-verifier', 'query-engine', 'graph-client'];

const node = (name: string) => ({ id: name.length, labels: ['Component'], properties: { name } });
const pathRow = (names: string[]) => ({
  path: {
    nodes: names.map(node),
    edges: names.slice(1).map((_, i) => ({ id: i, relationshipType: 'DEPENDS_ON', sourceId: names[i]!.length, destinationId: names[i + 1]!.length, properties: {} })),
  },
  pathWeight: names.length - 1,
});

const impact = (component: string, direction: string, hops: number, score: number, decisions: any[] = [], owners: any[] = [], target = '') => ({
  target, component, direction, hops, score, decisions, owners,
});
const dec = (id: string, title: string) => ({ id, title, status: 'active' });
const own = (id: string, name: string) => ({ id, name, pattern: '/p/' });

describe('pathComponents / annotationsFromImpact', () => {
  it('reads the walk out of a compacted path_between row', () => {
    // the real shape: {path: {_path, length, relationships}, pathWeight}
    expect(pathComponents({ path: { _path: WALK, length: 3, relationships: [] }, pathWeight: 3 })).toEqual(WALK);
    expect(pathComponents({ _path: WALK })).toEqual(WALK);
    for (const bad of [undefined, null, {}, { _path: 'x' }, { _path: [] }, { path: {} }]) expect(pathComponents(bad)).toEqual([]);
    expect(pathComponents({ _path: ['a', 5, '', 'b'] })).toEqual(['a', 'b']);
  });

  it('keeps the first row per component and drops null decision / owner placeholders', () => {
    const m = annotationsFromImpact([
      impact('query-engine', 'DEPENDENCY', 1, 0.06, [dec('ADR-004', 'Parameterize'), null], [own('P-2', 'Alex')]),
      impact('query-engine', 'DEPENDENCY', 1, 0.99, [dec('OTHER', 'x')]),
      impact('web-frontend', 'DEPENDENT', 2, 0.03),
    ]);
    expect(m.get('query-engine')).toEqual({
      pageRank: 0.06,
      decisions: [{ id: 'ADR-004', title: 'Parameterize', status: 'active' }],
      owners: [{ id: 'P-2', name: 'Alex', pattern: '/p/' }],
    });
    expect(m.get('web-frontend')).toEqual({ pageRank: 0.03, decisions: [], owners: [] });
  });
});

describe('buildLearningPath', () => {
  it('orders hops start -> steps -> goal, with annotations where known', () => {
    const ann = annotationsFromImpact([
      impact('query-engine', 'DEPENDENCY', 2, 0.06, [dec('ADR-004', 'Parameterize')], [own('P-2', 'Alex')]),
    ]);
    const p = buildLearningPath('web-frontend', 'graph-client', WALK, ann);
    expect(p).toMatchObject({ source: 'web-frontend', target: 'graph-client', found: true, length: 3 });
    expect(p.hops.map((h) => [h.index, h.component, h.role])).toEqual([
      [0, 'web-frontend', 'start'],
      [1, 'citation-verifier', 'step'],
      [2, 'query-engine', 'step'],
      [3, 'graph-client', 'goal'],
    ]);
    const qe = p.hops[2]!;
    expect(qe).toMatchObject({ annotated: true, pageRank: 0.06 });
    expect(qe.decisions.map((d) => d.id)).toEqual(['ADR-004']);
    expect(qe.owners.map((o) => o.id)).toEqual(['P-2']);
    // hops with no annotation are still listed, flagged as such
    expect(p.hops[1]).toMatchObject({ annotated: false, decisions: [], owners: [], pageRank: null });
  });

  it('an empty walk is a graceful "no path", not an error', () => {
    expect(buildLearningPath('a', 'b', [], new Map())).toEqual({ source: 'a', target: 'b', found: false, length: 0, hops: [] });
  });

  it('a single component is a walk of length 0', () => {
    const p = buildLearningPath('a', 'a', ['a'], new Map());
    expect(p).toMatchObject({ found: true, length: 0 });
    expect(p.hops).toHaveLength(1);
    expect(p.hops[0]!.role).toBe('start');
  });
});

const pathEntry = (source: string, target: string): ToolTraceEntry => ({
  step: 1, source: 'llm', tool: 'path_between', args: { sourceName: source, targetName: target },
  status: 'ok', rowCount: 1, evidenceIds: 0, durationMs: 1,
});
const pathOutput = (rows: unknown[]): ToolOutput => ({
  ok: true, tool: 'path_between', rows, rowCount: rows.length, truncated: false,
  evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] },
});

describe('assembleLearningPaths', () => {
  const clientWith = (impactFor: (component: string) => unknown[] | Error) =>
    ({
      executeQuery: vi.fn(async (_ws: string, name: string, params: any) => {
        if (name !== 'counterfactualImpact') return payload([]);
        const r = impactFor(params.component);
        if (r instanceof Error) throw r;
        return payload(r);
      }),
    }) as unknown as GatewayClient & { executeQuery: ReturnType<typeof vi.fn> };

  it('annotates the whole walk with two lookups (one anchored at each end) and records them in the trace', async () => {
    const client = clientWith((c) =>
      c === 'web-frontend'
        ? [
            impact('citation-verifier', 'DEPENDENCY', 1, 0.05, [dec('ADR-003', 'Fail closed')], [own('P-3', 'Sam')], c),
            impact('query-engine', 'DEPENDENCY', 2, 0.06, [dec('ADR-004', 'Parameterize')], [], c),
            impact('graph-client', 'DEPENDENCY', 3, 0.09, [dec('ADR-005', 'Pool')], [], c),
          ]
        : [impact('web-frontend', 'DEPENDENT', 3, 0.03, [dec('CHAT-101', 'Never invent nodes')], [], c)]
    );
    const { paths, trace } = await assembleLearningPaths({
      ctx: { client }, workspaceId: 'ws', asOf: 1_700_000_000,
      pathCalls: [{ entry: pathEntry('web-frontend', 'graph-client'), output: pathOutput([{ path: { _path: WALK }, pathWeight: 3 }]) }],
    });
    expect(paths).toHaveLength(1);
    const p = paths[0]!;
    expect(p.hops.every((h) => h.annotated)).toBe(true);
    expect(p.hops[0]!.decisions.map((d) => d.id)).toEqual(['CHAT-101']); // the start comes from the target-anchored call
    expect(p.hops[1]!.owners.map((o) => o.name)).toEqual(['Sam']);
    expect(p.hops[3]!.decisions.map((d) => d.id)).toEqual(['ADR-005']);

    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(client.executeQuery).toHaveBeenCalledWith('ws', 'counterfactualImpact', { component: 'web-frontend', asOf: 1_700_000_000, maxDepth: 3, limit: 100 });
    expect(client.executeQuery).toHaveBeenCalledWith('ws', 'counterfactualImpact', { component: 'graph-client', asOf: 1_700_000_000, maxDepth: 3, limit: 100 });
    expect(trace.map((t) => [t.tool, t.source, t.status])).toEqual([
      ['counterfactual_impact', 'pipeline', 'ok'],
      ['counterfactual_impact', 'pipeline', 'ok'],
    ]);
  });

  it('an empty path_between result becomes a found=false path and costs no extra graph calls', async () => {
    const client = clientWith(() => []);
    const { paths, trace } = await assembleLearningPaths({
      ctx: { client }, workspaceId: 'ws', asOf: 1,
      pathCalls: [{ entry: pathEntry('a', 'b'), output: pathOutput([]) }],
    });
    expect(paths).toEqual([{ source: 'a', target: 'b', found: false, length: 0, hops: [] }]);
    expect(trace).toEqual([]);
    expect(client.executeQuery).not.toHaveBeenCalled();
  });

  it('a failing annotation lookup keeps the walk, unannotated, and traces the error', async () => {
    const client = clientWith(() => new Error('[NO GRAPH, NO ANSWER] unavailable'));
    const { paths, trace } = await assembleLearningPaths({
      ctx: { client }, workspaceId: 'ws', asOf: 1,
      pathCalls: [{ entry: pathEntry('web-frontend', 'graph-client'), output: pathOutput([{ path: { _path: WALK }, pathWeight: 3 }]) }],
    });
    expect(paths[0]).toMatchObject({ found: true, length: 3 });
    expect(paths[0]!.hops.every((h) => !h.annotated)).toBe(true);
    expect(trace.every((t) => t.status === 'error')).toBe(true);
  });

  it('ignores failed or non-path tool results, de-duplicates and caps the number of paths', async () => {
    const client = clientWith(() => []);
    const failed = { entry: pathEntry('x', 'y'), output: { ...pathOutput([]), ok: false } };
    const other = { entry: { ...pathEntry('x', 'y'), tool: 'risk_ranking' }, output: pathOutput([]) };
    const many = ['a', 'b', 'c', 'd', 'e'].map((t) => ({ entry: pathEntry('s', t), output: pathOutput([]) }));
    const { paths } = await assembleLearningPaths({
      ctx: { client }, workspaceId: 'ws', asOf: 1,
      pathCalls: [failed, other, ...many, many[0]!],
    });
    expect(paths.map((p) => p.target)).toEqual(['a', 'b', 'c']);
  });

  it('annotates at most 5 hops deep but still lists a longer walk', async () => {
    const long = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    const client = clientWith(() => []);
    const { paths } = await assembleLearningPaths({
      ctx: { client }, workspaceId: 'ws', asOf: 1,
      pathCalls: [{ entry: pathEntry('n0', 'n6'), output: pathOutput([{ path: { _path: long }, pathWeight: 6 }]) }],
    });
    expect(paths[0]!.hops).toHaveLength(7);
    expect(client.executeQuery.mock.calls.every((c) => c[2].maxDepth === 5)).toBe(true);
  });
});

describe('pipeline: learning paths from a planner-chosen path_between', () => {
  const client = (() =>
    ({
      executeQuery: vi.fn(async (_ws: string, name: string, params: any) => {
        switch (name) {
          case 'resolveScope':
            return payload([{ matchedFiles: [{ properties: { path: 'apps/web/page.tsx' } }], allComponents: [{ properties: { name: 'web-frontend' } }] }]);
          case 'blastRadius':
            return payload([{ f: { properties: { path: 'apps/web/page.tsx' } }, c: { properties: { name: 'web-frontend' } } }], ['web-frontend']);
          case 'constrainingDecisions':
            return payload([{ id: 'CHAT-101', title: 'Never invent nodes', status: 'accepted', component: 'web-frontend' }], ['CHAT-101']);
          case 'pathBetween':
            return payload([pathRow(WALK)], ['web-frontend', 'graph-client']);
          case 'counterfactualImpact':
            return payload(
              params.component === 'web-frontend'
                ? [impact('query-engine', 'DEPENDENCY', 2, 0.06, [dec('ADR-004', 'Parameterize')], [own('P-2', 'Alex')])]
                : []
            );
          default:
            return payload([]);
        }
      }),
    }) as unknown as GatewayClient & { executeQuery: ReturnType<typeof vi.fn> })();

  const planner = vi
    .fn()
    .mockResolvedValueOnce({ calls: [{ tool: 'path_between', args: { sourceName: 'web-frontend', targetName: 'graph-client' } }], done: true });

  it('attaches the annotated walk to the response and traces the extra lookups', async () => {
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws',
      request: { task: 'I am new: how does the web frontend reach the graph client?', files: ['apps/web/page.tsx'] },
      toolSelection: { generator: planner },
      customGenerator: async () => ({
        summary: { overview: 'o', riskLevel: 'low', keyTakeaways: [{ claim: 'c', citedNodeIds: ['CHAT-101'] }] },
        blastRadius: { analysis: 'a', affectedComponents: [] }, keyOwners: [], constrainingDecisions: [], precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.learningPaths).toHaveLength(1);
    const lp = res.learningPaths![0]!;
    expect(lp.hops.map((h) => h.component)).toEqual(WALK);
    expect(lp.hops[2]!.decisions[0]!.id).toBe('ADR-004');
    expect(res.toolTrace!.filter((t) => t.tool === 'counterfactual_impact' && t.source === 'pipeline')).toHaveLength(2);
    // the LLM-selected call count is unchanged by the pipeline's own annotation lookups
    expect(res.toolSelection!.llmCallCount).toBe(1);
  });

  it('has no learningPaths when the planner did not ask for a path', async () => {
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws',
      request: { task: 'Refactor page', files: ['apps/web/page.tsx'] },
      toolSelection: { generator: async () => ({ done: true }) },
      customGenerator: async () => ({
        summary: { overview: 'o', riskLevel: 'low', keyTakeaways: [{ claim: 'c', citedNodeIds: ['CHAT-101'] }] },
        blastRadius: { analysis: 'a', affectedComponents: [] }, keyOwners: [], constrainingDecisions: [], precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.learningPaths).toBeUndefined();
  });
});

describe('planner prompt', () => {
  it('nudges the model to use path_between for onboarding / "how do A and B connect" tasks', () => {
    const p = buildPlannerPrompt({
      task: 't', scope: { files: [], components: [] }, coreSummary: '', specs: [], alreadyRan: [], observations: [], step: 1, maxSteps: 3, callsLeft: 5,
    });
    expect(p).toMatch(/path_between between them/);
    expect(p).toMatch(/learning path/);
  });
});
