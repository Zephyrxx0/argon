import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonGraphClient, ArgonEmbedder } from '@argon/graph';
import { DirectGraphGatewayClient, executeBriefingPipeline, executeTool, assembleLearningPaths } from '@argon/agent';
import { seedWorkspace, type SeedData } from '../src/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.resolve(__dirname, '../fixtures/seeds/argon-dogfood.json');

const isFalkorLive = await (async () => {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const ok = await probe.ping();
    await probe.close();
    return ok;
  } catch {
    return false;
  }
})();

// Learning path against a real graph: path_between (algo.SPpaths) + counterfactual_impact annotations
describe.skipIf(!isFalkorLive)('learning path on the seeded argon-dogfood graph (live FalkorDB)', () => {
  const ws = `test_learning_path_${Date.now()}`;
  let client: ArgonGraphClient;
  let gateway: DirectGraphGatewayClient;
  const NOW = 1_800_000_000_000;

  beforeAll(async () => {
    client = new ArgonGraphClient();
    await client.connect();
    gateway = new DirectGraphGatewayClient(client);
    const data: SeedData = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    data.workspaceId = ws;
    const tmp = path.join(os.tmpdir(), `${ws}.json`);
    fs.writeFileSync(tmp, JSON.stringify(data));
    try {
      await seedWorkspace(client, tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }, 60_000);

  afterAll(async () => {
    try { await client.selectGraph(ws).delete(); } catch { /* ignore */ }
    await client.close();
  });

  const walk = async (sourceName: string, targetName: string) => {
    const out = await executeTool({ client: gateway, now: () => NOW }, ws, 'path_between', { sourceName, targetName });
    return assembleLearningPaths({
      ctx: { client: gateway, now: () => NOW },
      workspaceId: ws,
      asOf: NOW,
      pathCalls: [
        {
          entry: { step: 1, source: 'llm', tool: 'path_between', args: { sourceName, targetName }, status: 'ok', rowCount: out.rowCount, evidenceIds: 0, durationMs: 1 },
          output: out,
        },
      ],
    });
  };

  it('walks web-frontend -> graph-client in order, annotated with real decisions and owners', async () => {
    const { paths, trace } = await walk('web-frontend', 'graph-client');
    expect(paths).toHaveLength(1);
    const p = paths[0]!;
    expect(p.found).toBe(true);
    expect(p.hops.map((h) => h.component)).toEqual(['web-frontend', 'citation-verifier', 'query-engine', 'graph-client']);
    expect(p.hops.every((h) => h.annotated)).toBe(true);

    const by = Object.fromEntries(p.hops.map((h) => [h.component, h]));
    // decisions governing the components, from the graph
    expect(by['web-frontend']!.decisions.map((d) => d.id)).toEqual(expect.arrayContaining(['CHAT-102']));
    expect(by['web-frontend']!.decisions.map((d) => d.id)).not.toContain('CHAT-101'); // superseded by CHAT-102
    expect(by['citation-verifier']!.decisions.map((d) => d.id)).toContain('ADR-003');
    expect(by['query-engine']!.decisions.map((d) => d.id)).toContain('ADR-004');
    expect(by['graph-client']!.decisions.map((d) => d.id)).toContain('ADR-005');
    // owners of record (CODEOWNERS)
    expect(by['citation-verifier']!.owners.map((o) => o.id)).toEqual(['P-003']);
    expect(by['query-engine']!.owners.map((o) => o.id)).toEqual(['P-002']);
    // PageRank comes from algo.pageRank
    expect(by['query-engine']!.pageRank).toBeGreaterThan(0);
    expect(trace).toHaveLength(2);
  });

  it('a direction with no path is a "no path" result, not an error', async () => {
    // DEPENDS_ON goes web-frontend -> ... -> graph-client, never back
    const { paths, trace } = await walk('graph-client', 'web-frontend');
    expect(paths).toEqual([{ source: 'graph-client', target: 'web-frontend', found: false, length: 0, hops: [] }]);
    expect(trace).toEqual([]);
  });

  it('an unknown component is also "no path"', async () => {
    const { paths } = await walk('web-frontend', 'does-not-exist');
    expect(paths[0]).toMatchObject({ found: false });
  });

  it('end to end: a planner-chosen path_between lands in the briefing response', async () => {
    const res = await executeBriefingPipeline({
      client: gateway,
      graphClient: client,
      embedder: new ArgonEmbedder(),
      workspaceId: ws,
      request: { task: 'I am new to the web frontend: how does it reach the graph client?', files: ['apps/web/app/page.tsx'] },
      now: () => NOW,
      toolSelection: {
        generator: async () => ({
          calls: [{ tool: 'path_between', args: { sourceName: 'web-frontend', targetName: 'graph-client' } }],
          done: true,
        }),
      },
      customGenerator: async () => ({
        summary: { overview: 'o', riskLevel: 'low', keyTakeaways: [{ claim: 'The frontend depends on the graph client through the verifier and query engine.', citedNodeIds: ['web-frontend'] }] },
        blastRadius: { analysis: 'a', affectedComponents: [] }, keyOwners: [], constrainingDecisions: [], precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.learningPaths).toHaveLength(1);
    expect(res.learningPaths![0]!.hops.map((h) => h.component)).toEqual(['web-frontend', 'citation-verifier', 'query-engine', 'graph-client']);
    const tools = res.toolTrace!.map((t) => `${t.source}:${t.tool}`);
    expect(tools).toEqual(expect.arrayContaining(['llm:path_between', 'pipeline:counterfactual_impact']));
  }, 60_000);
});
