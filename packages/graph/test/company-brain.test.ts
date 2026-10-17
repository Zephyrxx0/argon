import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ArgonGraphClient } from '../src/client';
import { getCypherQuery, whoKnows, precedentSearch, constrainingDecisions, toCytoscapeElements } from '../src';
import { initWorkspaceGraph } from '../src/schema/init';
import { FIXTURE_VEC_1, FIXTURE_VEC_2 } from './seed-fixture';

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

const QUERIES_DIR = path.resolve(__dirname, '../queries');

describe('Company Brain: query files and embedded copies (offline)', () => {
  // getCypherQuery() prefers the .cypher file on disk and falls back to an embedded copy
  // (used when the files are not shipped, e.g. a bundled gateway). Both must say the same thing.
  const embeddedSource = fs.readFileSync(path.resolve(__dirname, '../src/queries/index.ts'), 'utf-8');

  for (const file of fs.readdirSync(QUERIES_DIR).filter((f) => f.endsWith('.cypher'))) {
    it(`${file}: embedded fallback equals the file on disk`, () => {
      const onDisk = fs.readFileSync(path.join(QUERIES_DIR, file), 'utf-8');
      const start = embeddedSource.indexOf(`'${file}': \``);
      expect(start).toBeGreaterThanOrEqual(0);
      const bodyStart = embeddedSource.indexOf('`', start) + 1;
      // the embedded text lives in a template literal; evaluate it the way the runtime does
      let end = bodyStart;
      while (embeddedSource[end] !== '`' || embeddedSource[end - 1] === '\\') end++;
      const literal = embeddedSource.slice(bodyStart, end);
      const embedded = new Function(`return \`${literal}\`;`)() as string;
      expect(embedded.trim()).toBe(onDisk.trim());
    });
  }

  it('04_who_knows aggregates authored and reviewed in separate branches', () => {
    const q = getCypherQuery('04_who_knows.cypher');
    expect(q).toMatch(/UNION ALL/);
    // the old shape joined authors and reviewers in one MATCH, which multiplies rows
    expect(q).not.toMatch(/OPTIONAL MATCH \(reviewer/);
  });

  it('transforms CODEOWNERS owner rows into OWNS edges (Person vs Team)', () => {
    const payload = toCytoscapeElements([
      {
        component: 'billing',
        authorId: null,
        authorName: null,
        authoredCount: 0,
        reviewerId: null,
        reviewerName: null,
        reviewedCount: 0,
        ownerId: '@acme/payments',
        ownerName: 'payments',
        ownerPattern: '/src/billing/',
      },
    ]);
    const owner = payload.graph.nodes.find((n) => n.data.id === '@acme/payments');
    expect(owner?.data.type).toBe('Team');
    const edge = payload.graph.edges.find((e) => e.data.label === 'OWNS');
    expect(edge?.data.source).toBe('@acme/payments');
    expect(edge?.data.target).toBe('billing');
    expect(edge?.data.properties).toEqual({ pattern: '/src/billing/' });
  });
});

describe('Company Brain: live FalkorDB query semantics', () => {
  describe.skipIf(!isFalkorLive)('who_knows / precedent provenance', () => {
    const ws = `test_company_brain_${Date.now()}`;
    let client: ArgonGraphClient;

    beforeAll(async () => {
      client = new ArgonGraphClient();
      await client.connect();
      await initWorkspaceGraph(client, ws);
      await client.query(
        ws,
        `CREATE (c:Component {name: 'billing'}), (c2:Component {name: 'auth'})
         CREATE (f1:File {path: 'src/billing/retry.ts'}), (f2:File {path: 'src/billing/client.ts'})
         CREATE (f3:File {path: 'src/auth/jwt.ts'})
         CREATE (f1)-[:IN_COMPONENT]->(c), (f2)-[:IN_COMPONENT]->(c), (f3)-[:IN_COMPONENT]->(c2)
         CREATE (alice:Person {id: 'alice', display_name: 'Alice'})
         CREATE (bob:Person {id: 'bob', display_name: 'Bob'})
         CREATE (carol:Person {id: 'carol', name: 'Carol'})
         CREATE (dave:Person {id: 'dave', display_name: 'Dave'})
         CREATE (pr1:PullRequest {id: 'pr_1', number: 1, title: 'Add retry', merged_at: 100, url: 'https://github.com/o/r/pull/1'})
         CREATE (alice)-[:AUTHORED]->(pr1), (bob)-[:REVIEWED]->(pr1), (carol)-[:REVIEWED]->(pr1)
         CREATE (pr1)-[:TOUCHES]->(f1), (pr1)-[:TOUCHES]->(f2)
         CREATE (pr2:PullRequest {id: 'pr_2', number: 2, title: 'Tune retry', merged_at: 200})
         CREATE (alice)-[:AUTHORED]->(pr2), (bob)-[:REVIEWED]->(pr2)
         CREATE (pr2)-[:TOUCHES]->(f1)
         CREATE (pr3:PullRequest {id: 'pr_3', number: 3, title: 'JWT', merged_at: 300})
         CREATE (dave)-[:AUTHORED]->(pr3), (pr3)-[:TOUCHES]->(f3)
         CREATE (t:Team {id: '@acme/payments', name: 'payments'})
         CREATE (t)-[:OWNS {pattern: '/src/billing/', coverage: 1.0}]->(c)
         CREATE (i:Issue {id: 'issue_7', number: 7, title: 'Retry storm', state: 'closed', url: 'https://github.com/o/r/issues/7'})
         CREATE (pr1)-[:CLOSES]->(i)
         CREATE (da:Decision {id: 'dec_a', title: 'Backoff', status: 'accepted', valid_from: 100, embedding: vecf32($v1)})
         CREATE (db:Decision {id: 'dec_b', title: 'No provenance', status: 'accepted', valid_from: 100, embedding: vecf32($v2)})
         CREATE (da)-[:GOVERNS]->(c), (db)-[:GOVERNS]->(c)
         CREATE (da)-[:EXTRACTED_FROM]->(pr1)`,
        { v1: FIXTURE_VEC_1, v2: FIXTURE_VEC_2 }
      );
    });

    afterAll(async () => {
      try {
        await client.selectGraph(ws).delete();
      } catch {
        /* ignore */
      }
      await client.close();
    });

    it('REGRESSION: a PR with two reviewers is counted once for its author', async () => {
      const res = await whoKnows(client, ws, { components: ['billing'] });
      const authorRows = res.raw.filter((r) => r.authorId === 'alice');
      // Alice authored PR 1 and PR 2 (PR 1 touches two files, still one PR) => 2, in one row.
      expect(authorRows).toHaveLength(1);
      expect(authorRows[0]!.authoredCount).toBe(2);
      // summing every row the way the dispatcher does must give 2, not 3 or 4
      const totalAuthored = res.raw
        .filter((r) => r.authorId === 'alice')
        .reduce((n, r) => n + r.authoredCount, 0);
      expect(totalAuthored).toBe(2);
    });

    it('counts reviews per reviewer without involving the author', async () => {
      const res = await whoKnows(client, ws, { components: ['billing'] });
      const byReviewer = new Map(res.raw.filter((r) => r.reviewerId).map((r) => [r.reviewerId!, r.reviewedCount]));
      expect(byReviewer.get('bob')).toBe(2);
      expect(byReviewer.get('carol')).toBe(1);
      // reviewers do not get authored credit and authors do not get review credit
      for (const r of res.raw) {
        if (r.authorId) expect(r.reviewedCount).toBe(0);
        if (r.reviewerId) expect(r.authoredCount).toBe(0);
      }
      // falls back to Person.name when display_name is absent
      expect(res.raw.find((r) => r.reviewerId === 'carol')?.reviewerName).toBe('Carol');
    });

    it('returns the CODEOWNERS owner of record and scopes everything to the requested components', async () => {
      const billing = await whoKnows(client, ws, { components: ['billing'] });
      const owner = billing.raw.find((r) => r.ownerId);
      expect(owner).toMatchObject({ component: 'billing', ownerId: '@acme/payments', ownerPattern: '/src/billing/' });
      expect(billing.raw.some((r) => r.authorId === 'dave')).toBe(false);

      const auth = await whoKnows(client, ws, { components: ['auth'] });
      expect(auth.raw.map((r) => r.authorId).filter(Boolean)).toEqual(['dave']);
      expect(auth.raw.some((r) => r.ownerId)).toBe(false);
      expect(auth.evidence.primaryIds).toContain('auth');
    });

    it('returns an empty result (not an error) for a component nobody touched', async () => {
      const res = await whoKnows(client, ws, { components: ['ghost'] });
      expect(res.raw).toEqual([]);
    });

    it('05: constraining decisions carry their pull request and closed issue', async () => {
      const res = await constrainingDecisions(client, ws, { files: ['src/billing/retry.ts'], asOf: 150 });
      const a = res.raw.find((r) => r.id === 'dec_a');
      expect(a).toMatchObject({
        prId: 'pr_1',
        prNumber: 1,
        prUrl: 'https://github.com/o/r/pull/1',
        issueId: 'issue_7',
        issueNumber: 7,
        issueUrl: 'https://github.com/o/r/issues/7',
        issueState: 'closed',
      });
      const b = res.raw.find((r) => r.id === 'dec_b');
      expect(b).toBeDefined();
      expect(b!.prId ?? null).toBeNull();
      expect(b!.issueId ?? null).toBeNull();
      // one row per (decision, component, issue): no duplicates for a decision with a single issue
      expect(res.raw.filter((r) => r.id === 'dec_a')).toHaveLength(1);
    });

    it('06: precedent search returns the extracting PR and the issue it closes', async () => {
      const res = await precedentSearch(client, ws, { queryVector: FIXTURE_VEC_1, limit: 5 });
      const top = res.raw[0] as any;
      expect(top.decision.properties.id).toBe('dec_a');
      expect(top.pullRequest.properties.id).toBe('pr_1');
      expect(top.pullRequest.properties.url).toBe('https://github.com/o/r/pull/1');
      expect(top.issue.properties.number).toBe(7);
      const ids = res.graph.nodes.map((n) => n.data.id);
      expect(ids).toContain('pr_1');
      expect(ids).toContain('issue_7');

      const noProv = res.raw.find((r: any) => r.decision.properties.id === 'dec_b') as any;
      expect(noProv).toBeDefined();
      expect(noProv.pullRequest ?? null).toBeNull();
      expect(noProv.issue ?? null).toBeNull();
    });
  });
});
