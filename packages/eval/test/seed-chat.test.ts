import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonGraphClient, ArgonEmbedder, constrainingDecisions } from '@argon/graph';
import { DirectGraphGatewayClient, executeBriefingPipeline } from '@argon/agent';
import { parseChatThreads } from '@argon/ingest';
import { seedWorkspace, type SeedData } from '../src/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.resolve(__dirname, '../fixtures/seeds');
const load = (name: string): SeedData => JSON.parse(fs.readFileSync(path.join(seedsDir, name), 'utf-8'));

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

describe('synthetic chat source: seed invariants (offline)', () => {
  for (const file of ['synthetic-microservices.json', 'argon-dogfood.json']) {
    describe(file, () => {
      const data = load(file);

      it('declares itself synthetic and passes the ingest reader', () => {
        expect(data.chat).toBeDefined();
        expect((data.chat as any).synthetic).toBe(true);
        expect((data.chat as any).note).toMatch(/INVENTED/);
        const parsed = parseChatThreads(data.chat);
        expect(parsed.threads.length).toBeGreaterThanOrEqual(2);
      });

      it('ships a 512-d vector for every chat decision (seeding needs no model download)', () => {
        for (const t of data.chat!.threads) expect(t.decision.embedding, t.decision.id).toHaveLength(512);
      });

      it('only references components / pull requests that exist, and uses fictional .example links', () => {
        const components = new Set(data.components.map((c) => c.name));
        const prIds = new Set([
          ...data.reverts.flatMap((r) => [r.revertId, r.revertedId]),
          ...(data.pullRequests ?? []).map((p) => p.id),
        ]);
        for (const t of data.chat!.threads) {
          expect(components.has(t.decision.component), t.decision.id).toBe(true);
          if (t.decision.extracted_from) expect(prIds.has(t.decision.extracted_from), t.decision.id).toBe(true);
          expect(new URL(t.url).hostname).toMatch(/\.example$/);
        }
      });

      it('does not collide with existing decision ids and contains no email addresses', () => {
        const existing = new Set(data.decisions.map((d) => d.id));
        for (const t of data.chat!.threads) expect(existing.has(t.decision.id)).toBe(false);
        expect(JSON.stringify({ ...data.chat, threads: data.chat!.threads.map((t) => ({ ...t, decision: { ...t.decision, embedding: undefined } })) })).not.toMatch(
          /[\w.+-]+@[\w-]+\.[\w.]+/
        );
      });
    });
  }

  it('leaves the Ember corpus untouched (it mirrors a real project: no invented conversations)', () => {
    expect(load('emberjs-rfcs.json').chat).toBeUndefined();
  });
});

describe.skipIf(!isFalkorLive)('synthetic chat source: live FalkorDB', () => {
  const ws = `test_seed_chat_${Date.now()}`;
  let client: ArgonGraphClient;
  const q = async (cypher: string) => ((await client.roQuery(ws, cypher)).data ?? []) as any[];
  const tmp = path.join(os.tmpdir(), `${ws}.json`);
  const seed = async () => {
    const data = load('synthetic-microservices.json');
    data.workspaceId = ws;
    fs.writeFileSync(tmp, JSON.stringify(data));
    try {
      await seedWorkspace(client, tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  };
  const totals = async () => ({
    nodes: Number((await q('MATCH (n) RETURN count(n) AS n'))[0].n),
    edges: Number((await q('MATCH ()-[r]->() RETURN count(r) AS n'))[0].n),
  });

  beforeAll(async () => {
    client = new ArgonGraphClient();
    await client.connect();
    await seed();
  }, 60_000);

  afterAll(async () => {
    try { await client.selectGraph(ws).delete(); } catch { /* ignore */ }
    await client.close();
  });

  it('seeds chat decisions with their labels, supersession and provenance', async () => {
    expect(Number((await q(`MATCH (d:Decision {source_kind: 'chat'}) RETURN count(d) AS n`))[0].n)).toBe(3);
    expect(await q(`MATCH (d:Decision {source_kind: 'chat'}) WHERE d.synthetic <> true RETURN d.id`)).toEqual([]);
    expect(await q(`MATCH (a:Decision)-[:SUPERSEDES]->(b:Decision) WHERE a.source_kind = 'chat' RETURN a.id AS a, b.id AS b`)).toEqual([
      { a: 'CHAT-002', b: 'CHAT-001' },
    ]);
    const old = (await q(`MATCH (d:Decision {id: 'CHAT-001'}) RETURN d.status AS s, d.valid_to AS vt`))[0];
    expect(old).toEqual({ s: 'superseded', vt: 1678276800 });
    const prov = await q(
      `MATCH (:Decision {id: 'CHAT-003'})-[:EXTRACTED_FROM]->(pr:PullRequest)-[:CLOSES]->(i:Issue) RETURN pr.number AS pr, i.number AS issue`
    );
    expect(prov).toEqual([{ pr: 71, issue: 1120 }]);
  });

  it('re-seeding adds nothing (idempotent): same node and edge counts', async () => {
    const before = await totals();
    await seed();
    expect(await totals()).toEqual(before);
  }, 60_000);

  it('the superseded chat decision is not in force, the replacement is, and the originals are unaffected', async () => {
    const res = await constrainingDecisions(client, ws, { files: ['src/billing/retry.ts'], asOf: 1_690_000_000 });
    const ids = res.raw.map((r) => r.id);
    expect(ids).toContain('CHAT-002');
    expect(ids).not.toContain('CHAT-001');
    expect(ids).toEqual(expect.arrayContaining(['DEC-002', 'DEC-009']));
    // chat decisions are older than every ADR here: they never displace a benchmark-relevant row
    expect(ids.indexOf('CHAT-002')).toBeGreaterThan(ids.indexOf('DEC-009'));
    const chat = res.raw.find((r) => r.id === 'CHAT-002')!;
    expect(chat).toMatchObject({ sourceKind: 'chat', synthetic: true, sourceChannel: '#payments-eng', prNumber: 39 });
    // time travel: before the replacement, the original rule is the one in force
    const feb = await constrainingDecisions(client, ws, { files: ['src/billing/retry.ts'], asOf: 1_677_000_000 });
    expect(feb.raw.map((r) => r.id)).toContain('CHAT-001');
    expect(feb.raw.map((r) => r.id)).not.toContain('CHAT-002');
  });

  it('precedent search finds a chat decision by meaning', async () => {
    const embedder = new ArgonEmbedder();
    const { vector } = await embedder.embed('how many times may the sync quarantine queue grow before events are dropped', true);
    const res: any = await new DirectGraphGatewayClient(client).executeQuery(ws, 'precedentSearch', { queryVector: vector, limit: 3 });
    const top = res.raw.map((r: any) => r.decision.properties.id);
    expect(top).toContain('CHAT-003');
  }, 60_000);

  it('a briefing cites a chat decision and returns its (synthetic) source', async () => {
    const res = await executeBriefingPipeline({
      client: new DirectGraphGatewayClient(client),
      graphClient: client,
      embedder: new ArgonEmbedder(),
      workspaceId: ws,
      toolSelection: false,
      request: { task: 'Refactor billing/retry.ts', files: ['src/billing/retry.ts'] },
      customGenerator: async () => ({
        summary: {
          overview: 'Retries are bounded by a rule agreed in chat.',
          riskLevel: 'high',
          keyTakeaways: [
            { claim: 'CHAT-002 (agreed in #payments-eng) limits retries to 4 attempts and 20 seconds.', citedNodeIds: ['CHAT-002', 'PR-039'] },
          ],
        },
        blastRadius: { analysis: 'billing', affectedComponents: [] },
        keyOwners: [],
        constrainingDecisions: [],
        precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    expect((res.evidence as any).verifiedNodeIds).toEqual(expect.arrayContaining(['CHAT-002', 'PR-039']));
    const chat = res.sources!.find((s) => s.kind === 'chat' && s.nodeId === 'CHAT-002')!;
    expect(chat).toMatchObject({
      relatedTo: 'CHAT-002',
      synthetic: true,
      label: 'Chat thread #payments-eng (synthetic)',
      url: 'https://chat.synthetic-demo.example/archives/payments-eng/p1678276800',
    });
    // the PR the thread was about is linked too
    expect(res.sources!.some((s) => s.kind === 'pull_request' && s.relatedTo === 'CHAT-002')).toBe(true);
  }, 60_000);
});
