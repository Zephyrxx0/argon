import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonGraphClient, ArgonEmbedder, whoKnows, constrainingDecisions } from '@argon/graph';
import { DirectGraphGatewayClient, executeBriefingPipeline } from '@argon/agent';
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

describe('Company Brain showcase seeds: data invariants (offline)', () => {
  for (const file of ['synthetic-microservices.json', 'argon-dogfood.json']) {
    describe(file, () => {
      const data = load(file);
      const personIds = new Set((data.persons ?? []).map((p) => p.id));
      const prIds = new Set([
        ...data.reverts.flatMap((r) => [r.revertId, r.revertedId]),
        ...(data.pullRequests ?? []).map((p) => p.id),
      ]);
      const components = new Set(data.components.map((c) => c.name));

      it('has reviews, issues, CLOSES inputs and provenance (the judge path shows them)', () => {
        expect((data.reviewed ?? []).length).toBeGreaterThan(0);
        expect((data.issues ?? []).length).toBeGreaterThan(0);
        expect((data.issues ?? []).some((i) => (i.closed_by ?? []).length > 0)).toBe(true);
        expect(data.decisions.some((d) => d.extracted_from)).toBe(true);
        expect((data.owners ?? []).length).toBeGreaterThan(0);
      });

      it('every reference resolves and nobody reviews their own PR', () => {
        const authorOf = new Map((data.authored ?? []).map((a) => [a.pr_id, a.author_id]));
        for (const r of data.reviewed ?? []) {
          expect(personIds.has(r.reviewer_id), `reviewer ${r.reviewer_id}`).toBe(true);
          expect(prIds.has(r.pr_id), `reviewed PR ${r.pr_id}`).toBe(true);
          expect(authorOf.get(r.pr_id)).not.toBe(r.reviewer_id);
        }
        for (const a of data.authored ?? []) {
          expect(personIds.has(a.author_id)).toBe(true);
          expect(prIds.has(a.pr_id)).toBe(true);
        }
        for (const i of data.issues ?? []) {
          for (const pr of i.closed_by ?? []) expect(prIds.has(pr), `${i.id} closed_by ${pr}`).toBe(true);
        }
        const decisionIds = new Set(data.decisions.map((d) => d.id));
        for (const d of data.decisions) {
          if (d.extracted_from) expect(prIds.has(d.extracted_from), `${d.id} extracted_from`).toBe(true);
          expect(decisionIds.has(d.id)).toBe(true);
        }
        const filePaths = new Set(data.files.map((f) => f.path));
        for (const p of data.pullRequests ?? []) for (const f of p.files ?? []) expect(filePaths.has(f), `file ${f}`).toBe(true);
        for (const o of data.owners ?? []) {
          expect(components.has(o.component)).toBe(true);
          if (o.kind === 'person') expect(personIds.has(o.owner_id)).toBe(true);
        }
      });

      it('numbers and ids are unique (PullRequest.number is a unique constraint)', () => {
        const numbers = (data.pullRequests ?? []).map((p) => p.number).filter((n) => n != null);
        expect(new Set(numbers).size).toBe(numbers.length);
        const issueIds = (data.issues ?? []).map((i) => i.id);
        expect(new Set(issueIds).size).toBe(issueIds.length);
        const reviewKeys = (data.reviewed ?? []).map((r) => `${r.reviewer_id}|${r.pr_id}`);
        expect(new Set(reviewKeys).size).toBe(reviewKeys.length);
      });

      it('is synthetic: links only point at the fictional demo repository; no emails', () => {
        const urls = [
          ...(data.pullRequests ?? []).map((p) => p.url),
          ...(data.issues ?? []).map((i) => i.url),
        ].filter(Boolean) as string[];
        for (const u of urls) expect(u).toMatch(/^https:\/\/github\.com\/argon\/synthetic-demo\/(pull|issues)\/\d+$/);
        const text = JSON.stringify({ ...data, decisions: undefined });
        expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      });
    });
  }

  it('leaves the Ember corpus untouched: it mirrors a real project, so no invented people or issues are attached', () => {
    const ember = load('emberjs-rfcs.json');
    expect(ember.reviewed).toBeUndefined();
    expect(ember.issues).toBeUndefined();
    expect(ember.persons).toBeUndefined();
  });
});

describe.skipIf(!isFalkorLive)('Company Brain showcase seeds: live FalkorDB', () => {
  const ws = `test_seed_cb_${Date.now()}`;
  let client: ArgonGraphClient;
  const q = async (cypher: string, params: Record<string, unknown> = {}) =>
    ((await client.roQuery(ws, cypher, params)).data ?? []) as any[];

  beforeAll(async () => {
    client = new ArgonGraphClient();
    await client.connect();
    // seed a copy of the synthetic dataset into an isolated workspace (never touch the showcase one)
    const data = load('synthetic-microservices.json');
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

  it('satisfies the Track 3 acceptance queries', async () => {
    expect(Number((await q('MATCH (:Person)-[:REVIEWED]->(:PullRequest) RETURN count(*) AS n'))[0].n)).toBeGreaterThan(0);
    expect(Number((await q('MATCH (i:Issue) RETURN count(i) AS n'))[0].n)).toBe(5);
    expect(Number((await q('MATCH (:PullRequest)-[:CLOSES]->(:Issue) RETURN count(*) AS n'))[0].n)).toBe(4);
    // an issue is linked to the components its closing PR touched
    const affects = await q(`MATCH (i:Issue {number: 1042})-[:AFFECTS]->(c:Component) RETURN c.name AS c`);
    expect(affects.map((r) => r.c)).toEqual(['billing']);
    // the open issue has no closing PR, so affects nothing
    expect(Number((await q(`MATCH (:Issue {number: 1201})-[r:AFFECTS]->() RETURN count(r) AS n`))[0].n)).toBe(0);
    // decision provenance
    const prov = await q(`MATCH (d:Decision {id: 'DEC-002'})-[:EXTRACTED_FROM]->(pr:PullRequest)-[:CLOSES]->(i:Issue) RETURN pr.number AS pr, pr.url AS prUrl, i.number AS issue, i.url AS issueUrl`);
    expect(prov).toEqual([
      {
        pr: 42,
        prUrl: 'https://github.com/argon/synthetic-demo/pull/42',
        issue: 1042,
        issueUrl: 'https://github.com/argon/synthetic-demo/issues/1042',
      },
    ]);
    // revert nodes created from `reverts` keep their title / revert flag after the metadata merge
    const rev = (await q(`MATCH (pr:PullRequest {id: 'PR-042'}) RETURN pr.title AS t, pr.is_revert AS r, pr.number AS n`))[0];
    expect(rev).toEqual({ t: 'Revert Linear Backoff on Gateway Timeout (Incident #1042 Retry Storm)', r: true, n: 42 });
  });

  it('who_knows is exact on the seeded graph: PR-042 has two reviewers but its author is counted once', async () => {
    const res = await whoKnows(client, ws, { components: ['billing'] });
    const authored = Object.fromEntries(res.raw.filter((r) => r.authorId).map((r) => [r.authorName, r.authoredCount]));
    const reviewed = Object.fromEntries(res.raw.filter((r) => r.reviewerId).map((r) => [r.reviewerName, r.reviewedCount]));
    // billing PRs: PR-039 (alice; reviewed by bob, carol), PR-042 (bob; reviewed by alice, carol), PR-089 (alice; dan)
    expect(authored).toEqual({ 'Alice Nakamura': 2, 'Bob Okafor': 1 });
    expect(reviewed).toEqual({ 'Bob Okafor': 1, 'Carol Lindqvist': 2, 'Alice Nakamura': 1, 'Dan Petrov': 1 });
    expect(res.raw.find((r) => r.ownerId)).toMatchObject({ ownerId: '@synthetic-demo/payments', ownerName: 'payments' });
  });

  it('a briefing for the S1 scenario carries PR / issue provenance end to end', async () => {
    const client2 = new DirectGraphGatewayClient(client);
    const embedder = new ArgonEmbedder();
    const res = await executeBriefingPipeline({
      client: client2,
      graphClient: client,
      embedder,
      workspaceId: ws,
      toolSelection: false,
      request: { task: 'Refactor billing/retry.ts', files: ['src/billing/retry.ts'] },
      customGenerator: async () => ({
        summary: {
          overview: 'Retry changes are governed by DEC-002.',
          riskLevel: 'high',
          keyTakeaways: [
            { claim: 'DEC-002 (from PR #42, which closed incident #1042) requires exponential backoff.', citedNodeIds: ['DEC-002', 'PR-042', 'issue_1042'] },
          ],
        },
        blastRadius: { analysis: 'billing', affectedComponents: [] },
        keyOwners: [], constrainingDecisions: [], precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    expect((res.evidence as any).verifiedNodeIds).toEqual(expect.arrayContaining(['DEC-002', 'PR-042', 'issue_1042']));
    const urls = res.sources!.filter((s) => s.relatedTo === 'DEC-002').map((s) => `${s.kind}:${s.url}`);
    expect(urls).toEqual(
      expect.arrayContaining([
        'pull_request:https://github.com/argon/synthetic-demo/pull/42',
        'issue:https://github.com/argon/synthetic-demo/issues/1042',
      ])
    );
    expect(res.codeOwners).toEqual([
      expect.objectContaining({ ownerId: '@synthetic-demo/payments', component: 'billing', kind: 'team' }),
    ]);
  }, 60_000);

  it('constraining decisions expose provenance from the graph itself', async () => {
    const res = await constrainingDecisions(client, ws, { files: ['src/billing/retry.ts'], asOf: 1_690_000_000 });
    const dec002 = res.raw.find((r) => r.id === 'DEC-002');
    expect(dec002).toMatchObject({ prNumber: 42, issueNumber: 1042, issueState: 'closed' });
  });
});
