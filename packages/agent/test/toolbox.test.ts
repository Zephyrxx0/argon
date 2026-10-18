import { describe, it, expect, vi } from 'vitest';
import {
  ARGON_TOOLS,
  compactValue,
  executeTool,
  getToolByName,
  getToolByQueryName,
  isValidWorkspaceId,
  MAX_ROWS,
} from '../src/tools/toolbox.js';
import { QUERY_TO_TOOL_NAME, summarizeArgs } from '../src/tools/trace.js';
import type { GatewayClient } from '../src/client/types.js';

const payload = (raw: unknown[], primaryIds: string[] = []) => ({
  raw,
  graph: { nodes: [], edges: [] },
  evidence: { nodeCount: raw.length, edgeCount: 0, primaryIds },
});

const clientWith = (impl: (...a: any[]) => Promise<unknown>) =>
  ({ executeQuery: vi.fn(impl) }) as unknown as GatewayClient & { executeQuery: ReturnType<typeof vi.fn> };

describe('toolbox definitions', () => {
  it('has one tool per locked query, with unique snake_case names matching the trace mapping', () => {
    expect(ARGON_TOOLS).toHaveLength(10);
    expect(new Set(ARGON_TOOLS.map((t) => t.name)).size).toBe(10);
    expect(new Set(ARGON_TOOLS.map((t) => t.queryName)).size).toBe(10);
    for (const t of ARGON_TOOLS) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(QUERY_TO_TOOL_NAME[t.queryName]).toBe(t.name);
      expect(getToolByName(t.name)).toBe(t);
      expect(getToolByQueryName(t.queryName)).toBe(t);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('only resolve_scope is withheld from the LLM planner', () => {
    expect(ARGON_TOOLS.filter((t) => !t.plannerSelectable).map((t) => t.name)).toEqual(['resolve_scope']);
  });

  it('validates workspace ids', () => {
    expect(isValidWorkspaceId('synthetic-demo')).toBe(true);
    expect(isValidWorkspaceId('pub-user_1-repo-28d702')).toBe(true);
    for (const bad of ['', 'a b', 'a;b', 'x"y', '../x', undefined, 5, 'a'.repeat(129)]) {
      expect(isValidWorkspaceId(bad)).toBe(false);
    }
  });
});

describe('compactValue', () => {
  it('flattens FalkorDB nodes, drops embeddings/emails, keeps the canonical id', () => {
    const node = {
      id: 7,
      labels: ['Decision'],
      properties: { id: 'D-1', title: 'T', embedding: new Array(512).fill(0.1), email_hash: 'h', status: 'active' },
    };
    expect(compactValue(node)).toEqual({ _label: 'Decision', _id: 'D-1', id: 'D-1', title: 'T', status: 'active' });
  });

  it('collapses paths and edges and replaces numeric vectors', () => {
    const path = {
      nodes: [
        { id: 1, labels: ['Component'], properties: { name: 'A' } },
        { id: 2, labels: ['Component'], properties: { name: 'B' } },
      ],
      edges: [{ id: 9, relationshipType: 'DEPENDS_ON', sourceId: 1, destinationId: 2, properties: {} }],
    };
    expect(compactValue(path)).toEqual({ _path: ['A', 'B'], length: 1, relationships: ['DEPENDS_ON'] });
    expect(compactValue(new Array(512).fill(1))).toBe('<512-d vector>');
    expect(compactValue(null)).toBeNull();
    expect(compactValue(BigInt(3))).toBe(3);
  });

  it('bounds long arrays and deep structures', () => {
    const arr = compactValue(Array.from({ length: 100 }, (_, i) => `s${i}`)) as unknown[];
    expect(arr).toHaveLength(26);
    expect(arr[25]).toMatch(/\+75 more/);
    let deep: any = { v: 'leaf' };
    for (let i = 0; i < 10; i++) deep = { child: deep };
    expect(JSON.stringify(compactValue(deep))).toContain('<truncated>');
  });
});

describe('executeTool', () => {
  it('validates arguments before touching the graph', async () => {
    const client = clientWith(async () => payload([]));
    const res = await executeTool({ client }, 'ws', 'blast_radius', { files: [] });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Invalid arguments/);
    expect(client.executeQuery).not.toHaveBeenCalled();
  });

  it('rejects unknown tools and bad workspace ids without querying', async () => {
    const client = clientWith(async () => payload([]));
    expect((await executeTool({ client }, 'ws', 'run_cypher', {})).error).toMatch(/Unknown tool/);
    expect((await executeTool({ client }, 'bad ws!', 'risk_ranking', {})).error).toMatch(/Invalid workspaceId/);
    expect(client.executeQuery).not.toHaveBeenCalled();
  });

  it('applies schema defaults and passes the mapped query name/params to the client', async () => {
    const client = clientWith(async () => payload([{ component: 'A', score: 0.5 }], ['A']));
    const res = await executeTool({ client }, 'ws', 'risk_ranking', {});
    expect(client.executeQuery).toHaveBeenCalledWith('ws', 'riskRanking', { limit: 10 });
    expect(res).toMatchObject({ ok: true, tool: 'risk_ranking', rowCount: 1 });
    expect(res.evidence.primaryIds).toEqual(['A']);
  });

  it('defaults asOf to the injected clock for constraining_decisions', async () => {
    const client = clientWith(async () => payload([]));
    await executeTool({ client, now: () => 4242 }, 'ws', 'constraining_decisions', { files: ['a.ts'] });
    expect(client.executeQuery).toHaveBeenCalledWith('ws', 'constrainingDecisions', { files: ['a.ts'], asOf: 4242 });
    await executeTool({ client, now: () => 4242 }, 'ws', 'constraining_decisions', { files: ['a.ts'], asOf: 7 });
    expect(client.executeQuery).toHaveBeenLastCalledWith('ws', 'constrainingDecisions', { files: ['a.ts'], asOf: 7 });
  });

  it('counterfactual_impact: defaults asOf to the injected clock and maps defaults to the query', async () => {
    const client = clientWith(async () => payload([]));
    await executeTool({ client, now: () => 4242 }, 'ws', 'counterfactual_impact', { component: 'billing' });
    expect(client.executeQuery).toHaveBeenCalledWith('ws', 'counterfactualImpact', {
      component: 'billing',
      asOf: 4242,
      maxDepth: 3,
      limit: 25,
    });
    await executeTool({ client }, 'ws', 'counterfactual_impact', { component: 'billing', asOf: 7, maxDepth: 2, limit: 5 });
    expect(client.executeQuery).toHaveBeenLastCalledWith('ws', 'counterfactualImpact', {
      component: 'billing',
      asOf: 7,
      maxDepth: 2,
      limit: 5,
    });
  });

  it('counterfactual_impact rejects bad arguments without querying', async () => {
    const client = clientWith(async () => payload([]));
    for (const args of [{}, { component: '' }, { component: 'a', maxDepth: 9 }, { component: 'a', limit: 0 }]) {
      const res = await executeTool({ client }, 'ws', 'counterfactual_impact', args);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Invalid arguments/);
    }
    expect(client.executeQuery).not.toHaveBeenCalled();
  });

  it('counterfactual_impact is offered to the planner', () => {
    expect(getToolByName('counterfactual_impact')?.plannerSelectable).toBe(true);
  });

  it('embeds the text for precedent_search and never forwards the raw text as a vector', async () => {
    const client = clientWith(async () => payload([]));
    const embed = vi.fn(async () => ({ vector: new Array(512).fill(0.25) }));
    await executeTool({ client, embedder: { embed } }, 'ws', 'precedent_search', { query: 'retry storms' });
    expect(embed).toHaveBeenCalledWith('retry storms', true);
    const params = client.executeQuery.mock.calls[0]![2] as { queryVector: number[]; limit: number };
    expect(params.queryVector).toHaveLength(512);
    expect(params.limit).toBe(5);
  });

  it('fails (not throws) for precedent_search without an embedder', async () => {
    const client = clientWith(async () => payload([]));
    const res = await executeTool({ client }, 'ws', 'precedent_search', { query: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/embedder/);
  });

  it('turns graph failures into ok:false results (fail closed, never throws)', async () => {
    const client = clientWith(async () => {
      throw new Error('[NO GRAPH, NO ANSWER] FalkorDB is unavailable: ECONNREFUSED');
    });
    const res = await executeTool({ client }, 'ws', 'risk_ranking', {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/NO GRAPH, NO ANSWER/);
    expect(res.rows).toEqual([]);
  });

  it(`caps rows at ${MAX_ROWS} and reports truncation`, async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ component: `c${i}`, score: i }));
    const client = clientWith(async () => payload(rows));
    const res = await executeTool({ client }, 'ws', 'risk_ranking', { limit: 100 });
    expect(res.rows).toHaveLength(MAX_ROWS);
    expect(res.rowCount).toBe(80);
    expect(res.truncated).toBe(true);
  });
});

describe('summarizeArgs', () => {
  it('hides vectors, truncates long lists and strings', () => {
    const s = summarizeArgs({
      queryVector: new Array(512).fill(0.1),
      files: Array.from({ length: 9 }, (_, i) => `f${i}.ts`),
      note: 'x'.repeat(300),
      asOf: 5,
    });
    expect(s.queryVector).toBe('<512-d vector>');
    expect((s.files as unknown[]).length).toBe(6);
    expect((s.files as unknown[])[5]).toMatch(/\+4 more/);
    expect((s.note as string).length).toBeLessThan(130);
    expect(s.asOf).toBe(5);
    expect(summarizeArgs(null)).toEqual({});
  });
});
