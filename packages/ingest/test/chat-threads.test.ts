import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient, initWorkspaceGraph } from '@argon/graph';
import {
  ChatThreadFileSchema,
  parseChatThreads,
  chatThreadsToDecisions,
  writeChatThreads,
  type ChatThreadFile,
} from '../src/index.js';

const thread = (id: string, decision: Record<string, unknown>, at = 1_700_000_000) => ({
  id: `thread-${id}`,
  channel: '#eng',
  url: `https://chat.example.test/archives/eng/${id}`,
  messages: [
    { author: 'Ada', at, text: 'We should cap retries.' },
    { author: 'Bo', at: at + 60, text: 'Agreed, decided: cap at 3 attempts.' },
  ],
  decision: {
    id,
    title: `Decision ${id} about retries`,
    summary: 'Retries are capped at three attempts for every client.',
    component: 'billing',
    ...decision,
  },
});

const file = (...threads: unknown[]): unknown => ({ synthetic: true, threads });

describe('chat thread reader: validation (offline)', () => {
  it('refuses files that are not explicitly marked synthetic (there is no real chat integration)', () => {
    for (const bad of [{ threads: [thread('A', {})] }, { synthetic: false, threads: [thread('A', {})] }, { synthetic: 'yes', threads: [thread('A', {})] }]) {
      expect(() => parseChatThreads(bad)).toThrow(/synthetic/);
    }
    expect(ChatThreadFileSchema.safeParse(file(thread('A', {}))).success).toBe(true);
  });

  it('rejects malformed threads with a readable message', () => {
    expect(() => parseChatThreads(file())).toThrow(/threads/);
    expect(() => parseChatThreads(file({ ...thread('A', {}), url: 'javascript:alert(1)' }))).toThrow(/url/);
    expect(() => parseChatThreads(file({ ...thread('A', {}), messages: [] }))).toThrow(/messages/);
    expect(() => parseChatThreads(file(thread('bad id with spaces', {})))).toThrow(/decision id/);
    expect(() => parseChatThreads(file(thread('A', { embedding: [1, 2, 3] })))).toThrow(/embedding/);
  });

  it('rejects duplicate ids, unknown or self supersession', () => {
    expect(() => parseChatThreads(file(thread('A', {}), thread('A', {})))).toThrow(/duplicate/);
    expect(() => parseChatThreads(file(thread('B', { supersedes: 'NOPE' })))).toThrow(/unknown decision/);
    expect(() => parseChatThreads(file(thread('C', { supersedes: 'C' })))).toThrow(/itself/);
  });
});

describe('chat thread reader: mapping (offline)', () => {
  it('maps a thread to a chat decision with GOVERNS / EXTRACTED_FROM and a synthetic label', () => {
    const f = parseChatThreads(file(thread('A', { extracted_from: 'PR-1' })));
    const m = chatThreadsToDecisions(f);
    expect(m.decisions).toHaveLength(1);
    expect(m.decisions[0]).toMatchObject({
      id: 'A',
      source_kind: 'chat',
      synthetic: true,
      source_channel: '#eng',
      source_url: 'https://chat.example.test/archives/eng/A',
      status: 'accepted',
      valid_to: null,
      component_name: 'billing',
      valid_from: 1_700_000_060, // defaults to the last message
    });
    expect(m.governs).toEqual([{ decision_id: 'A', component_name: 'billing' }]);
    expect(m.extractedFrom).toEqual([{ decision_id: 'A', pr_id: 'PR-1' }]);
    expect(m.supersedes).toEqual([]);
    // the transcript is kept for embedding / audit
    expect(m.decisions[0]!.raw_text).toContain('Bo: Agreed');
  });

  it('closes the validity window of a superseded decision exactly when its replacement starts', () => {
    const f = parseChatThreads(
      file(thread('OLD', { valid_from: 1_600_000_000 }), thread('NEW', { valid_from: 1_650_000_000, supersedes: 'OLD' }))
    );
    const m = chatThreadsToDecisions(f);
    const old = m.decisions.find((d) => d.id === 'OLD')!;
    const next = m.decisions.find((d) => d.id === 'NEW')!;
    expect(old).toMatchObject({ status: 'superseded', valid_to: 1_650_000_000 });
    expect(next).toMatchObject({ status: 'accepted', valid_to: null });
    expect(m.supersedes).toEqual([{ source_id: 'NEW', target_id: 'OLD' }]);
  });

  it('refuses a replacement that does not take effect after what it replaces', () => {
    const f = parseChatThreads(
      file(thread('OLD', { valid_from: 1_650_000_000 }), thread('NEW', { valid_from: 1_600_000_000, supersedes: 'OLD' }))
    );
    expect(() => chatThreadsToDecisions(f)).toThrow(/does not take effect after/);
  });

  it('redacts secrets pasted into a thread', () => {
    const f = parseChatThreads(
      file({
        ...thread('S', {}),
        messages: [{ author: 'Ada', at: 1_700_000_000, text: 'use ghp_abcdefghijklmnopqrstuvwxyz0123456789 for the bot' }],
      })
    );
    expect(chatThreadsToDecisions(f).decisions[0]!.raw_text).not.toContain('ghp_abcdefghijkl');
  });

  it('is deterministic: the same input maps to the same rows', () => {
    const f = parseChatThreads(file(thread('A', {}), thread('B', { valid_from: 1_800_000_000, supersedes: 'A' })));
    expect(JSON.stringify(chatThreadsToDecisions(f))).toBe(JSON.stringify(chatThreadsToDecisions(f)));
  });
});

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

describe.skipIf(!isFalkorLive)('chat thread writer (live FalkorDB)', () => {
  const ws = `test_chat_${Date.now()}`;
  let client: ArgonGraphClient;
  const vec = new Array(512).fill(0).map((_, i) => (i === 3 ? 1 : 0));
  const q = async (cypher: string) => ((await client.roQuery(ws, cypher)).data ?? []) as any[];
  const counts = async () => ({
    nodes: Number((await q('MATCH (n) RETURN count(n) AS n'))[0].n),
    edges: Number((await q('MATCH ()-[r]->() RETURN count(r) AS n'))[0].n),
  });

  const input: ChatThreadFile = parseChatThreads(
    file(
      thread('CHAT-A', { valid_from: 1_600_000_000, embedding: vec, extracted_from: 'PR-7' }),
      thread('CHAT-B', { valid_from: 1_650_000_000, supersedes: 'CHAT-A', embedding: vec }),
      thread('CHAT-LOST', { component: 'ghost', extracted_from: 'PR-404', embedding: vec })
    )
  );

  beforeAll(async () => {
    client = new ArgonGraphClient();
    await client.connect();
    await initWorkspaceGraph(client, ws);
    await client.query(ws, `CREATE (:Component {name: 'billing'}), (:PullRequest {id: 'PR-7', number: 7, url: 'https://example.test/pull/7'})`);
  });

  afterAll(async () => {
    try { await client.selectGraph(ws).delete(); } catch { /* ignore */ }
    await client.close();
  });

  it('writes chat decisions with their labels and edges, skipping unknown components / PRs', async () => {
    const res = await writeChatThreads(client, ws, input, { embed: false });
    expect(res).toMatchObject({ decisions: 3, governs: 2, supersedes: 1, extractedFrom: 1, embedded: true });
    expect(res.skipped).toEqual({ components: ['ghost'], pullRequests: ['PR-404'] });

    const rows = await q(`MATCH (d:Decision {source_kind: 'chat'}) RETURN d.id AS id, d.synthetic AS syn, d.source_channel AS ch, d.status AS s, d.valid_to AS vt ORDER BY id`);
    expect(rows).toEqual([
      { id: 'CHAT-A', syn: true, ch: '#eng', s: 'superseded', vt: 1_650_000_000 },
      { id: 'CHAT-B', syn: true, ch: '#eng', s: 'accepted', vt: null },
      { id: 'CHAT-LOST', syn: true, ch: '#eng', s: 'accepted', vt: null },
    ]);
    expect((await q(`MATCH (:Decision {id: 'CHAT-B'})-[:SUPERSEDES]->(:Decision {id: 'CHAT-A'}) RETURN 1 AS x`)).length).toBe(1);
    expect((await q(`MATCH (:Decision {id: 'CHAT-A'})-[:EXTRACTED_FROM]->(:PullRequest {id: 'PR-7'}) RETURN 1 AS x`)).length).toBe(1);
    // nothing was invented for the unknown component / PR
    expect(await q(`MATCH (c:Component {name: 'ghost'}) RETURN c`)).toEqual([]);
    expect(await q(`MATCH (p:PullRequest {id: 'PR-404'}) RETURN p`)).toEqual([]);
  });

  it('chat decisions are reachable by vector search (they carry a real vecf32 embedding)', async () => {
    const res = await q(`CALL db.idx.vector.queryNodes('Decision', 'embedding', 5, vecf32([${vec.join(',')}])) YIELD node RETURN node.id AS id`);
    expect(res.map((r) => r.id)).toEqual(expect.arrayContaining(['CHAT-A', 'CHAT-B']));
  });

  it('is idempotent: writing the same threads again adds no nodes and no edges', async () => {
    const before = await counts();
    await writeChatThreads(client, ws, input, { embed: false });
    await writeChatThreads(client, ws, input, { embed: false });
    expect(await counts()).toEqual(before);
  });

  it('refuses a non-synthetic document before touching the graph', async () => {
    const before = await counts();
    await expect(writeChatThreads(client, ws, { threads: [thread('X', {})] })).rejects.toThrow(/synthetic/);
    expect(await counts()).toEqual(before);
  });

  it('reports (does not fabricate) missing embeddings when the model is disabled', async () => {
    const res = await writeChatThreads(client, ws, file(thread('NOVEC', {})), { embed: false });
    expect(res.embedded).toBe(false);
    const row = (await q(`MATCH (d:Decision {id: 'NOVEC'}) RETURN d.embedding AS e`))[0];
    expect(row.e).toBeNull();
  });
});
