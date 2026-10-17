import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { simpleGit, type SimpleGit } from 'simple-git';
import {
  ArgonGraphClient, ArgonEmbedder, whoKnows, precedentSearch, constrainingDecisions,
} from '@argon/graph';
import {
  runIngestion, GitHubRateLimitError, hashAuthorEmail,
  type GitHubApi, type GhPull, type GhReview, type GhIssue,
} from '../src/index.js';

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

/* ───────────────────────── fixture repository ───────────────────────── */

interface Fixture {
  dir: string;
  sha: { adr: string; auth: string; decision: string; billing: string; merge: string };
  cleanup: () => Promise<void>;
}

const ALICE = { name: 'Alice Contributor', email: 'alice@company.com' };
const BOB = { name: 'Bob Builder', email: 'bob@company.com' };

async function commitAs(git: SimpleGit, who: { name: string; email: string }, message: string): Promise<string> {
  const res = await git.commit(message, undefined, { '--author': `${who.name} <${who.email}>` });
  return res.commit;
}

async function createFixture(): Promise<Fixture> {
  const dir = path.join(os.tmpdir(), `argon-cb-${randomUUID()}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const git = simpleGit(dir);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', ALICE.name);
  await git.addConfig('user.email', ALICE.email);
  const write = async (rel: string, body: string) => {
    await fs.promises.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.promises.writeFile(path.join(dir, rel), body);
  };

  // c1 (Alice): billing + ADR + CODEOWNERS   -> PR #1
  await write('packages/billing/src/retry.ts', 'export const retry = () => "linear";\n');
  await write('docs/adr/001-retry.md', '---\ntitle: "ADR-001: Linear retry"\nstatus: accepted\n---\n# ADR-001: Linear retry\nStatus: accepted\nRetries use a linear backoff.\n');
  await write('CODEOWNERS', '# owners\n* @alice-gh\n/packages/billing/ @acme/payments @carol-gh\n');
  await git.add(['.']);
  const adr = await commitAs(git, ALICE, 'feat(billing): linear retry (#1)');

  // c2 (Bob): auth                           -> PR #2
  await write('packages/auth/src/jwt.ts', 'export const jwt = 1;\n');
  await git.add(['.']);
  const auth = await commitAs(git, BOB, 'feat(auth): jwt sessions (#2)');

  // c3 (Alice): an architectural decision touching billing and auth -> PR #3
  await write('packages/billing/src/retry.ts', 'export const retry = () => "exponential";\n');
  await write('packages/auth/src/jwt.ts', 'export const jwt = 2;\n');
  await git.add(['.']);
  const decision = await commitAs(git, ALICE, 'feat: architecture decision, switch retries to exponential backoff (#3)');

  // c4 (Bob): billing client                 -> PR #4
  await write('packages/billing/src/client.ts', 'export const client = 1;\n');
  await git.add(['.']);
  const billing = await commitAs(git, BOB, 'fix(billing): client timeouts (#4)');

  // PR #5 merged with a merge commit (git log lists no files for it)
  await git.checkoutLocalBranch('feature/session');
  await write('packages/auth/src/session.ts', 'export const session = 1;\n');
  await git.add(['.']);
  await commitAs(git, BOB, 'feat(auth): sessions');
  await git.checkout('main');
  await git.raw(['merge', '--no-ff', '-m', 'Merge pull request #5 from acme/feature-session', 'feature/session']);
  const merge = (await git.revparse(['HEAD'])).trim();

  return {
    dir,
    sha: { adr, auth, decision, billing, merge },
    cleanup: () => fs.promises.rm(dir, { recursive: true, force: true }),
  };
}

/* ───────────────────────── injected GitHub API ───────────────────────── */

const pull = (number: number, login: string | null, sha: string | null, over: Partial<GhPull> = {}): GhPull => ({
  number, title: `PR ${number}`, body: null, state: 'closed', merged_at: '2026-01-05T00:00:00Z',
  updated_at: '2026-01-06T00:00:00Z', html_url: `https://github.com/acme/widgets/pull/${number}`,
  user: login ? { login } : null, merge_commit_sha: sha, ...over,
});
const review = (id: number, login: string, state = 'APPROVED', at = '2026-01-05T10:00:00Z', body: string | null = null): GhReview => ({
  id, user: { login }, state, body, submitted_at: at, html_url: `https://github.com/acme/widgets/pull/1#pullrequestreview-${id}`,
});
const issue = (number: number, state: 'open' | 'closed'): GhIssue => ({
  number, title: `Issue ${number}`, body: null, state, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  html_url: `https://github.com/acme/widgets/issues/${number}`, user: { login: 'someone' },
});

function githubFor(f: Fixture, opts: { unmapped?: number[] } = {}): GitHubApi & { calls: string[] } {
  const sha = (n: number, real: string) => (opts.unmapped?.includes(n) ? `${n}`.repeat(40).slice(0, 40) : real);
  const pulls: GhPull[] = [
    pull(1, 'alice-gh', sha(1, f.sha.adr), { body: 'Fixes #10' }),
    pull(2, 'bob-gh', sha(2, f.sha.auth), { body: 'Closes #11, #10' }),
    pull(3, 'alice-gh', sha(3, f.sha.decision)),
    pull(4, 'bob-gh', sha(4, f.sha.billing)),
    pull(5, 'bob-gh', sha(5, f.sha.merge)),
    pull(99, 'dependabot[bot]', 'f'.repeat(40)), // merge commit outside the mined history
  ];
  const reviews: Record<number, GhReview[]> = {
    1: [review(1, 'bob-gh'), review(2, 'carol-gh', 'COMMENTED'), review(3, 'carol-gh', 'APPROVED', '2026-01-05T12:00:00Z'), review(4, 'alice-gh', 'COMMENTED')],
    2: [review(5, 'alice-gh'), review(6, 'dependabot[bot]')],
    3: [review(7, 'carol-gh', 'COMMENTED', '2026-01-05T11:00:00Z', 'Looks right. We decided to use exponential backoff for every retry in billing going forward.')],
    4: [review(8, 'alice-gh'), review(9, 'carol-gh')],
    5: [review(10, 'alice-gh')],
    99: [review(11, 'alice-gh')],
  };
  const issues = [issue(10, 'closed'), issue(11, 'open'), issue(12, 'open')];
  const calls: string[] = [];
  return {
    calls,
    listMergedPulls: async () => { calls.push('pulls'); return pulls; },
    listReviews: async ({ number }) => { calls.push(`reviews#${number}`); return reviews[number] ?? []; },
    listIssues: async () => { calls.push('issues'); return issues; },
    getIssue: async ({ number }) => issues.find((i) => i.number === number) ?? null,
    // PR #99 was merged into another branch: its files come from the GitHub API
    listPullFiles: async ({ number }) => (number === 99 ? ['packages/billing/src/retry.ts'] : []),
    listCommitLogins: async () => [
      { sha: f.sha.adr, login: 'alice-gh' }, { sha: f.sha.auth, login: 'bob-gh' },
      { sha: f.sha.decision, login: 'alice-gh' }, { sha: f.sha.billing, login: 'bob-gh' },
    ],
  };
}

/* ───────────────────────── helpers ───────────────────────── */

async function rows(client: ArgonGraphClient, ws: string, cypher: string, params: Record<string, unknown> = {}): Promise<any[]> {
  const res = await client.roQuery(ws, cypher, params);
  return (res.data ?? []) as any[];
}
const count = async (client: ArgonGraphClient, ws: string, cypher: string, params = {}) =>
  Number((await rows(client, ws, cypher, params))[0]?.n ?? 0);

describe('Company Brain ingest (live FalkorDB, injected GitHub API)', () => {
  describe.skipIf(!isFalkorLive)('end to end', () => {
    let client: ArgonGraphClient;
    let fixture: Fixture;
    const workspaces: string[] = [];
    const wsName = (label: string) => {
      const ws = `test_cb_${label}_${Date.now()}`;
      workspaces.push(ws);
      return ws;
    };

    beforeAll(async () => {
      client = new ArgonGraphClient({ url: process.env.FALKORDB_URL || 'falkor://localhost:6379' });
      await client.connect();
      fixture = await createFixture();
    }, 60_000);

    afterAll(async () => {
      for (const ws of workspaces) {
        try { await client.selectGraph(ws).delete(); } catch { /* ignore */ }
      }
      await fixture?.cleanup();
      await client.close();
    });

    const ingest = (ws: string, api: GitHubApi | false, extra: Record<string, unknown> = {}) =>
      runIngestion({
        repoUrl: `file://${fixture.dir}`,
        workspaceId: ws,
        client,
        github: api === false ? false : { api, owner: 'acme', repo: 'widgets' },
        ...extra,
      });

    it('writes PRs, reviews, issues, CLOSES / AFFECTS, provenance and ownership; briefing queries are not inflated', async () => {
      const ws = wsName('full');
      const api = githubFor(fixture);
      const summary = await ingest(ws, api);

      expect(summary.githubStatus).toBe('completed');
      expect(summary.githubNotes).toEqual([]);
      expect(summary.pullRequestCount).toBe(6);
      expect(summary.issueCount).toBe(3);

      // --- acceptance queries from the Track 3 plan ---
      const reviewedEdges = await count(client, ws, 'MATCH (:Person)-[:REVIEWED]->(:PullRequest) RETURN count(*) AS n');
      expect(reviewedEdges).toBe(8); // #1: bob, carol  #2: alice  #3: carol  #4: alice, carol  #5: alice  #99: alice
      expect(await count(client, ws, 'MATCH (i:Issue) RETURN count(i) AS n')).toBe(3);

      // PR nodes carry number + url; the squash commit node IS the PR node
      const pr1 = (await rows(client, ws, `MATCH (pr:PullRequest {number: 1}) RETURN pr.id AS id, pr.url AS url, pr.state AS state, pr.title AS title`))[0];
      expect(pr1.id).toBe(`pr_${fixture.sha.adr.slice(0, 12)}`);
      expect(pr1.url).toBe('https://github.com/acme/widgets/pull/1');
      expect(pr1.state).toBe('merged');
      expect(pr1.title).toBe('feat(billing): linear retry (#1)'); // commit subject untouched (revert mining relies on it)
      // PR outside the history -> placeholder node
      const pr99 = (await rows(client, ws, `MATCH (pr:PullRequest {number: 99}) RETURN pr.id AS id, pr.title AS title`))[0];
      expect(pr99).toEqual({ id: 'pr_gh_99', title: 'PR 99' });
      // unique numbers: no two nodes share one
      expect(await count(client, ws, 'MATCH (pr:PullRequest) WHERE pr.number IS NOT NULL RETURN count(pr) AS n')).toBe(6);
      expect(await count(client, ws, 'MATCH (pr:PullRequest) WHERE pr.number IS NOT NULL RETURN count(DISTINCT pr.number) AS n')).toBe(6);

      // issues, CLOSES, AFFECTS
      const closes = await rows(client, ws, `MATCH (pr:PullRequest)-[:CLOSES]->(i:Issue) RETURN pr.number AS pr, i.number AS issue ORDER BY pr, issue`);
      expect(closes).toEqual([{ pr: 1, issue: 10 }, { pr: 2, issue: 10 }, { pr: 2, issue: 11 }]);
      // AFFECTS is derived from the files of the PRs that close the issue:
      //   #10 <- PR #1 (billing, docs/adr, CODEOWNERS at the root) and PR #2 (auth);  #11 <- PR #2 (auth)
      const affects = await rows(client, ws, `MATCH (i:Issue)-[r:AFFECTS]->(c:Component) RETURN i.number AS issue, c.name AS component, r.files AS files ORDER BY issue, component`);
      expect(affects).toEqual([
        { issue: 10, component: 'docs', files: 1 },
        { issue: 10, component: 'packages/auth', files: 1 },
        { issue: 10, component: 'packages/billing', files: 1 },
        { issue: 10, component: 'root', files: 1 },
        { issue: 11, component: 'packages/auth', files: 1 },
      ]);
      // an issue nobody closes affects nothing
      expect(await count(client, ws, `MATCH (:Issue {id: 'issue_12'})-[r:AFFECTS]->() RETURN count(r) AS n`)).toBe(0);
      const issue10 = (await rows(client, ws, `MATCH (i:Issue {id: 'issue_10'}) RETURN i.state AS state, i.url AS url, i.title AS title`))[0];
      expect(issue10).toEqual({ state: 'closed', url: 'https://github.com/acme/widgets/issues/10', title: 'Issue 10' });

      // identity: GitHub logins resolved to the git authors; unknown login => gh_ person; bots never
      const alice = hashAuthorEmail(ALICE.email);
      const bob = hashAuthorEmail(BOB.email);
      const logins = Object.fromEntries((await rows(client, ws, `MATCH (p:Person) WHERE p.github_login IS NOT NULL RETURN p.id AS id, p.github_login AS login`)).map((r) => [r.id, r.login]));
      expect(logins[alice]).toBe('alice-gh');
      expect(logins[bob]).toBe('bob-gh');
      expect(logins['gh_carol-gh']).toBe('carol-gh');
      expect(await count(client, ws, `MATCH (p:Person) WHERE p.id CONTAINS 'dependabot' RETURN count(p) AS n`)).toBe(0);
      expect(await count(client, ws, `MATCH (p:Person) RETURN count(p) AS n`)).toBe(3);

      // merge commit PR #5 got TOUCHES from its first-parent diff
      const mergeTouches = await rows(client, ws, `MATCH (pr:PullRequest {number: 5})-[:TOUCHES]->(f:File) RETURN f.path AS path`);
      expect(mergeTouches.map((r) => r.path)).toContain('packages/auth/src/session.ts');

      // --- who_knows: counts are exact (REGRESSION: PR #1 has two reviewers) ---
      const billing = await whoKnows(client, ws, { components: ['packages/billing'] });
      const authored = Object.fromEntries(billing.raw.filter((r) => r.authorId).map((r) => [r.authorId, r.authoredCount]));
      const reviewed = Object.fromEntries(billing.raw.filter((r) => r.reviewerId).map((r) => [r.reviewerId, r.reviewedCount]));
      // billing files are touched by PR #1 (alice), #3 (alice), #4 (bob)
      expect(authored).toEqual({ [alice]: 2, [bob]: 1 });
      // reviews: #1 bob+carol, #3 carol, #4 alice+carol, and #99 alice (merged on another branch, its
      // changed files come from GitHub)
      expect(reviewed).toEqual({ [bob]: 1, 'gh_carol-gh': 3, [alice]: 2 });

      // --- CODEOWNERS: owner of record ---
      const owners = billing.raw.filter((r) => r.ownerId).map((r) => [r.ownerId, r.ownerPattern]).sort();
      expect(owners).toEqual([['@acme/payments', '/packages/billing/'], ['gh_carol-gh', '/packages/billing/']]);
      const authOwners = (await whoKnows(client, ws, { components: ['packages/auth'] })).raw.filter((r) => r.ownerId);
      expect(authOwners.map((r) => r.ownerId)).toEqual([alice]); // `* @alice-gh` default rule
      expect(await count(client, ws, `MATCH (t:Team {id: '@acme/payments'})-[:OWNS]->(c:Component) RETURN count(c) AS n`)).toBe(1);

      // --- provenance (3.1) ---
      const decisions = await rows(client, ws, `MATCH (d:Decision) RETURN d.id AS id, d.source_kind AS kind, d.source_url AS url ORDER BY id`);
      const commitDecision = decisions.find((d) => d.kind === 'commit');
      expect(commitDecision.url).toBe(`https://github.com/acme/widgets/commit/${fixture.sha.decision}`);
      const adrDecision = decisions.find((d) => d.kind === 'adr');
      expect(adrDecision.url).toBe(`https://github.com/acme/widgets/blob/${fixture.sha.merge}/docs/adr/001-retry.md`);
      const extracted = await rows(client, ws, `MATCH (d:Decision)-[:EXTRACTED_FROM]->(pr:PullRequest) RETURN d.source_kind AS kind, pr.id AS pr, pr.number AS number ORDER BY kind`);
      expect(extracted).toEqual([
        { kind: 'adr', pr: `pr_${fixture.sha.adr.slice(0, 12)}`, number: 1 },
        { kind: 'comment', pr: `pr_${fixture.sha.decision.slice(0, 12)}`, number: 3 },
        { kind: 'commit', pr: `pr_${fixture.sha.decision.slice(0, 12)}`, number: 3 },
      ]);
      // the review comment became a Decision with a link to the comment itself
      const comment = decisions.find((d) => d.kind === 'comment');
      expect(comment.url).toBe('https://github.com/acme/widgets/pull/1#pullrequestreview-7');
      expect(await count(client, ws, `MATCH (d:Decision {source_kind: 'comment'})-[:GOVERNS]->(c:Component) RETURN count(c) AS n`)).toBe(1);

      // --- 06 returns a non-empty pullRequest (the Track 3 acceptance criterion) ---
      const embedder = new ArgonEmbedder();
      const q = await embedder.embed('switch retries to exponential backoff architecture decision', true);
      const prec = await precedentSearch(client, ws, { queryVector: q.vector, limit: 10 });
      const withPr = (prec.raw as any[]).filter((r) => r.pullRequest);
      expect(withPr.length).toBeGreaterThan(0);
      expect(withPr[0].pullRequest.properties.url).toMatch(/^https:\/\/github\.com\/acme\/widgets\/pull\/\d+$/);

      // --- 05 carries the PR; the issue shows up for a decision whose PR closes one ---
      const constraining = await constrainingDecisions(client, ws, { files: ['packages/billing/src/retry.ts'], asOf: Math.floor(Date.now() / 1000) + 60 });
      const withPrIds = constraining.raw.filter((r) => r.prId);
      expect(withPrIds.length).toBeGreaterThan(0);

      // job metadata
      const job = (await rows(client, ws, `MATCH (j:IngestJob {id: $id}) RETURN j.status AS status, j.github_status AS gh`, { id: summary.jobId }))[0];
      expect(job).toEqual({ status: 'completed', gh: 'completed' });
    }, 180_000);

    it('is idempotent: re-running the same ingest changes nothing', async () => {
      const ws = wsName('idem');
      await ingest(ws, githubFor(fixture));
      const snapshot = async () => ({
        // every run records its own IngestJob; everything else must be unchanged
        nodes: await count(client, ws, 'MATCH (n) WHERE NOT n:IngestJob RETURN count(n) AS n'),
        edges: await count(client, ws, 'MATCH ()-[r]->() RETURN count(r) AS n'),
        reviewed: await count(client, ws, 'MATCH ()-[r:REVIEWED]->() RETURN count(r) AS n'),
        owns: await count(client, ws, 'MATCH ()-[r:OWNS]->() RETURN count(r) AS n'),
        extracted: await count(client, ws, 'MATCH ()-[r:EXTRACTED_FROM]->() RETURN count(r) AS n'),
      });
      const before = await snapshot();
      const second = await ingest(ws, githubFor(fixture));
      expect(await snapshot()).toEqual(before);
      // and it can tell nothing new arrived
      expect(second.delta.newCommitCount).toBe(0);
      expect(second.delta.newDecisions).toEqual([]);
      expect(second.delta.supersededDecisions).toEqual([]);
    }, 180_000);

    it('a pr_gh_ placeholder is replaced by the commit node once the merge commit is in history (unique PR numbers survive)', async () => {
      const ws = wsName('retire');
      // first run: PR #3's merge sha is unknown => placeholder
      await ingest(ws, githubFor(fixture, { unmapped: [3] }));
      expect(await count(client, ws, `MATCH (pr:PullRequest {id: 'pr_gh_3'}) RETURN count(pr) AS n`)).toBe(1);
      // second run: the real sha is known
      await ingest(ws, githubFor(fixture));
      expect(await count(client, ws, `MATCH (pr:PullRequest {id: 'pr_gh_3'}) RETURN count(pr) AS n`)).toBe(0);
      const nodes = await rows(client, ws, `MATCH (pr:PullRequest {number: 3}) RETURN pr.id AS id`);
      expect(nodes).toEqual([{ id: `pr_${fixture.sha.decision.slice(0, 12)}` }]);
      expect(await count(client, ws, `MATCH (:Person)-[:REVIEWED]->(:PullRequest {number: 3}) RETURN count(*) AS n`)).toBe(1);
    }, 180_000);

    it('GitHub failures never fail the ingestion: rate limit => partial, outage => partial, disabled => skipped', async () => {
      // rate limited after the PR list
      const limited = githubFor(fixture);
      limited.listReviews = async () => { throw new GitHubRateLimitError('API rate limit exceeded'); };
      const wsLimited = wsName('limited');
      const s1 = await ingest(wsLimited, limited);
      expect(s1.githubStatus).toBe('partial');
      expect(s1.githubNotes.join(' ')).toMatch(/rate limit/i);
      expect(await count(client, wsLimited, 'MATCH (pr:PullRequest) WHERE pr.number IS NOT NULL RETURN count(pr) AS n')).toBe(6); // PRs kept
      expect(await count(client, wsLimited, 'MATCH ()-[r:REVIEWED]->() RETURN count(r) AS n')).toBe(0);
      expect((await rows(client, wsLimited, `MATCH (j:IngestJob {id: $id}) RETURN j.status AS status, j.github_status AS gh, j.github_note AS note`, { id: s1.jobId }))[0])
        .toMatchObject({ status: 'completed', gh: 'partial' });

      // total outage
      const down = githubFor(fixture);
      down.listMergedPulls = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), { code: 'ENOTFOUND' }); };
      down.listIssues = down.listMergedPulls as any;
      down.listCommitLogins = down.listMergedPulls as any;
      const wsDown = wsName('down');
      const s2 = await ingest(wsDown, down);
      expect(s2.githubStatus).toBe('partial');
      expect(s2.commitCount).toBeGreaterThanOrEqual(6);
      expect(await count(client, wsDown, 'MATCH (c:Component) RETURN count(c) AS n')).toBeGreaterThan(0);
      // git-derived knowledge still lands: authors, owners of record from CODEOWNERS, decision provenance (offline)
      expect(await count(client, wsDown, 'MATCH ()-[r:OWNS]->(:Component) RETURN count(r) AS n')).toBeGreaterThan(0);
      expect(await count(client, wsDown, 'MATCH (:Decision)-[r:EXTRACTED_FROM]->(:PullRequest) RETURN count(r) AS n')).toBeGreaterThan(0);

      // disabled
      const wsOff = wsName('off');
      const s3 = await ingest(wsOff, false);
      expect(s3.githubStatus).toBe('skipped');
      expect(await count(client, wsOff, 'MATCH (i:Issue) RETURN count(i) AS n')).toBe(0);
      expect(await count(client, wsOff, 'MATCH ()-[r:REVIEWED]->() RETURN count(r) AS n')).toBe(0);
    }, 240_000);

    it('a re-sync (since=...) only reads recent activity and reports what was added', async () => {
      const ws = wsName('resync');
      await ingest(ws, githubFor(fixture));
      const api = githubFor(fixture);
      let seenSince: string | undefined;
      const list = api.listMergedPulls;
      api.listMergedPulls = async (a) => { seenSince = a.since; return list(a); };
      const second = await runIngestion({
        repoUrl: `file://${fixture.dir}`, workspaceId: ws, client,
        github: { api, owner: 'acme', repo: 'widgets', since: '2026-01-01T00:00:00.000Z' },
      });
      expect(seenSince).toBe('2026-01-01T00:00:00.000Z');
      expect(second.githubStatus).toBe('completed');
    }, 180_000);
  });
});
