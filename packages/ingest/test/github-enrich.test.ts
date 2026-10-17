import { describe, it, expect, vi } from 'vitest';
import {
  createOctokitGitHubApi, asRateLimitError, GitHubRateLimitError,
  collectGitHubData, IdentityResolver, parseGitHubRepo, hashAuthorEmail,
  AUTHENTICATED_LIMITS, ANONYMOUS_LIMITS,
  type OctokitLike, type GitHubApi, type GitCommit, type GhPull, type GhReview, type GhIssue,
} from '../src/index.js';

/* ───────────────────────── Octokit adapter ───────────────────────── */

const pullPayload = (n: number, over: Record<string, unknown> = {}) => ({
  number: n, title: `PR ${n}`, body: null, state: 'closed', merged_at: '2026-01-02T00:00:00Z',
  updated_at: `2026-01-${String(30 - n).padStart(2, '0')}T00:00:00Z`, html_url: `https://github.com/o/r/pull/${n}`,
  user: { login: 'alice', id: 1 }, merge_commit_sha: `sha${n}`, ...over,
});

function fakeOctokit(overrides: Partial<Record<string, (p: any) => Promise<{ data: any }>>> = {}) {
  const calls: Array<{ fn: string; params: any }> = [];
  const wrap = (fn: string, impl: (p: any) => Promise<{ data: any }>) =>
    vi.fn(async (params: any) => {
      calls.push({ fn, params });
      return (overrides[fn] ?? impl)(params);
    });
  const octokit = {
    rest: {
      pulls: { list: wrap('pulls.list', async () => ({ data: [] })), listReviews: wrap('pulls.listReviews', async () => ({ data: [] })) },
      issues: { listForRepo: wrap('issues.listForRepo', async () => ({ data: [] })), get: wrap('issues.get', async () => ({ data: null })) },
      repos: { listCommits: wrap('repos.listCommits', async () => ({ data: [] })) },
    },
  } as unknown as OctokitLike;
  return { octokit, calls };
}

describe('createOctokitGitHubApi (injected Octokit, no network)', () => {
  it('lists only merged PRs, newest activity first, honouring max', async () => {
    const { octokit, calls } = fakeOctokit({
      'pulls.list': async () => ({
        data: [pullPayload(1), pullPayload(2, { merged_at: null }), pullPayload(3), pullPayload(4)],
      }),
    });
    const api = createOctokitGitHubApi(octokit);
    const pulls = await api.listMergedPulls({ owner: 'o', repo: 'r', max: 2 });
    expect(pulls.map((p) => p.number)).toEqual([1, 3]); // #2 was closed without merging
    expect(pulls[0]).toMatchObject({ merge_commit_sha: 'sha1', user: { login: 'alice', id: 1 } });
    expect(calls[0]!.params).toMatchObject({ owner: 'o', repo: 'r', state: 'closed', sort: 'updated', direction: 'desc', per_page: 100, page: 1 });
  });

  it('paginates until a short page, and stops at PRs older than `since`', async () => {
    const full = Array.from({ length: 100 }, (_, i) => pullPayload(i + 1, { updated_at: '2026-03-01T00:00:00Z' }));
    const { octokit, calls } = fakeOctokit({
      'pulls.list': async (p) =>
        p.page === 1
          ? { data: full }
          : { data: [pullPayload(101, { updated_at: '2026-02-01T00:00:00Z' }), pullPayload(102, { updated_at: '2025-01-01T00:00:00Z' })] },
    });
    const api = createOctokitGitHubApi(octokit);
    const all = await api.listMergedPulls({ owner: 'o', repo: 'r', max: 1000 });
    expect(all).toHaveLength(102);
    expect(calls.filter((c) => c.fn === 'pulls.list')).toHaveLength(2);

    const recent = await api.listMergedPulls({ owner: 'o', repo: 'r', max: 1000, since: '2026-01-15T00:00:00Z' });
    expect(recent.map((p) => p.number)).not.toContain(102); // older than `since`: dropped
    expect(recent).toHaveLength(101);
  });

  it('filters pull requests out of the issues listing', async () => {
    const issue = (n: number, extra = {}) => ({
      number: n, title: `I${n}`, body: null, state: n === 2 ? 'closed' : 'open',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', html_url: `https://github.com/o/r/issues/${n}`, user: { login: 'x' }, ...extra,
    });
    const { octokit } = fakeOctokit({
      'issues.listForRepo': async () => ({ data: [issue(1), issue(2), issue(3, { pull_request: { url: 'x' } })] }),
    });
    const issues = await createOctokitGitHubApi(octokit).listIssues({ owner: 'o', repo: 'r', max: 10 });
    expect(issues.map((i) => [i.number, i.state])).toEqual([[1, 'open'], [2, 'closed']]);
  });

  it('getIssue: null for missing issues and for pull requests', async () => {
    const notFound = Object.assign(new Error('Not Found'), { status: 404 });
    const missing = createOctokitGitHubApi(fakeOctokit({ 'issues.get': async () => { throw notFound; } }).octokit);
    expect(await missing.getIssue({ owner: 'o', repo: 'r', number: 5 })).toBeNull();
    const pr = createOctokitGitHubApi(fakeOctokit({ 'issues.get': async () => ({ data: { number: 5, pull_request: {} } }) }).octokit);
    expect(await pr.getIssue({ owner: 'o', repo: 'r', number: 5 })).toBeNull();
  });

  it('maps GitHub rate limiting (primary, secondary, 429) to GitHubRateLimitError; other errors pass through', async () => {
    const primary = Object.assign(new Error('API rate limit exceeded'), { status: 403, response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } } });
    expect(asRateLimitError(primary)).toBeInstanceOf(GitHubRateLimitError);
    expect(asRateLimitError(primary)!.resetAt).toBe(1700000000);
    expect(asRateLimitError(Object.assign(new Error('You have exceeded a secondary rate limit'), { status: 403 }))).toBeInstanceOf(GitHubRateLimitError);
    expect(asRateLimitError(Object.assign(new Error('slow down'), { status: 429 }))).toBeInstanceOf(GitHubRateLimitError);
    expect(asRateLimitError(Object.assign(new Error('Resource not accessible'), { status: 403 }))).toBeNull();
    expect(asRateLimitError(Object.assign(new Error('boom'), { status: 500 }))).toBeNull();

    const api = createOctokitGitHubApi(fakeOctokit({ 'pulls.list': async () => { throw primary; } }).octokit);
    await expect(api.listMergedPulls({ owner: 'o', repo: 'r', max: 5 })).rejects.toBeInstanceOf(GitHubRateLimitError);
    const api2 = createOctokitGitHubApi(fakeOctokit({ 'pulls.list': async () => { throw Object.assign(new Error('boom'), { status: 500 }); } }).octokit);
    await expect(api2.listMergedPulls({ owner: 'o', repo: 'r', max: 5 })).rejects.toThrow('boom');
  });

  it('lists the files of a pull request (paginated) and tolerates an Octokit without that endpoint', async () => {
    const files = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.ts` }));
    const { octokit, calls } = fakeOctokit();
    (octokit.rest.pulls as any).listFiles = vi.fn(async (p: any) => {
      calls.push({ fn: 'pulls.listFiles', params: p });
      return { data: p.page === 1 ? files : [{ filename: 'last.ts' }] };
    });
    const got = await createOctokitGitHubApi(octokit).listPullFiles!({ owner: 'o', repo: 'r', number: 3 });
    expect(got).toHaveLength(101);
    expect(got.at(-1)).toBe('last.ts');
    expect(calls.filter((c) => c.fn === 'pulls.listFiles').map((c) => c.params.page)).toEqual([1, 2]);

    const { octokit: bare } = fakeOctokit();
    expect(await createOctokitGitHubApi(bare).listPullFiles!({ owner: 'o', repo: 'r', number: 3 })).toEqual([]);
  });

  it('commit logins: sha -> login (null when the author has no GitHub account)', async () => {
    const { octokit } = fakeOctokit({
      'repos.listCommits': async () => ({ data: [{ sha: 'a', author: { login: 'alice', id: 7 } }, { sha: 'b', author: null }] }),
    });
    expect(await createOctokitGitHubApi(octokit).listCommitLogins({ owner: 'o', repo: 'r', max: 10 })).toEqual([
      { sha: 'a', login: 'alice', id: 7 },
      { sha: 'b', login: null, id: undefined },
    ]);
  });
});

/* ───────────────────────── collectGitHubData ───────────────────────── */

const H = (n: number) => String(n).repeat(40).slice(0, 40);
const ALICE = hashAuthorEmail('alice@company.com');
const BOB = hashAuthorEmail('bob@company.com');

function gitCommit(n: number, authorId: string, files: string[] = []): GitCommit {
  return {
    hash: H(n), message: `c${n}`, summary: `c${n}`, timestamp: 1000 + n, parents: [],
    author: { id: authorId, name: authorId, emailHash: authorId },
    files: files.map((path) => ({ path, status: 'M' as const })),
  };
}

const pull = (number: number, login: string | null, sha: string | null, over: Partial<GhPull> = {}): GhPull => ({
  number, title: `PR ${number}`, body: null, state: 'closed', merged_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z', html_url: `https://github.com/acme/widgets/pull/${number}`,
  user: login ? { login } : null, merge_commit_sha: sha, ...over,
});
const review = (id: number, login: string | null, state = 'APPROVED', at = '2026-01-01T10:00:00Z', body: string | null = null): GhReview => ({
  id, user: login ? { login } : null, state, body, submitted_at: at, html_url: `https://github.com/acme/widgets/pull/1#r${id}`,
});
const issue = (number: number, state: 'open' | 'closed' = 'open'): GhIssue => ({
  number, title: `Issue ${number}`, body: null, state, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  html_url: `https://github.com/acme/widgets/issues/${number}`, user: { login: 'x' },
});

function fakeApi(data: { pulls?: GhPull[]; reviews?: Record<number, GhReview[]>; issues?: GhIssue[]; logins?: Array<{ sha: string; login: string | null }> } = {}, hooks: Partial<GitHubApi> = {}): GitHubApi & { calls: string[] } {
  const calls: string[] = [];
  const api: GitHubApi = {
    listMergedPulls: async () => { calls.push('pulls'); return data.pulls ?? []; },
    listReviews: async ({ number }) => { calls.push(`reviews#${number}`); return data.reviews?.[number] ?? []; },
    listIssues: async () => { calls.push('issues'); return data.issues ?? []; },
    getIssue: async ({ number }) => { calls.push(`issue#${number}`); return (data.issues ?? []).find((i) => i.number === number) ?? null; },
    listCommitLogins: async () => { calls.push('logins'); return data.logins ?? []; },
    ...hooks,
  };
  return Object.assign(api, { calls });
}

const repo = parseGitHubRepo('https://github.com/acme/widgets')!;
const baseInput = (api: GitHubApi, commits: GitCommit[], extra: Record<string, unknown> = {}) => ({
  repo, api, commits,
  identity: new IdentityResolver([{ id: ALICE, name: 'Alice' }, { id: BOB, name: 'Bob' }]),
  limits: AUTHENTICATED_LIMITS,
  componentNames: new Set(['packages/billing', 'packages/auth']),
  ...extra,
});

describe('collectGitHubData', () => {
  it('maps PRs to commit nodes, writes authored / reviewed rows once per reviewer, and never counts self-reviews, bots or pending reviews', async () => {
    const commits = [gitCommit(2, BOB, ['packages/auth/jwt.ts']), gitCommit(1, ALICE, ['packages/billing/retry.ts'])];
    const api = fakeApi({
      pulls: [pull(1, 'alice-gh', H(1)), pull(2, 'bob-gh', H(2))],
      logins: [{ sha: H(1), login: 'alice-gh' }, { sha: H(2), login: 'bob-gh' }],
      reviews: {
        1: [
          review(1, 'bob-gh', 'COMMENTED', '2026-01-01T10:00:00Z'),
          review(2, 'bob-gh', 'APPROVED', '2026-01-01T12:00:00Z'), // 2nd review by the same person => one edge, count 2, latest state
          review(3, 'carol-gh'),
          review(4, 'alice-gh'), // the author answering on her own PR
          review(5, 'dependabot[bot]'),
          review(6, 'dave-gh', 'PENDING'),
          review(7, null), // deleted account
        ],
        2: [review(8, 'alice-gh')],
      },
    });
    const input = baseInput(api, commits);
    const data = await collectGitHubData(input);

    expect(data.status).toBe('completed');
    expect(data.mappedPullRequests.map((p) => [p.id, p.number])).toEqual([[`pr_${H(1).slice(0, 12)}`, 1], [`pr_${H(2).slice(0, 12)}`, 2]]);
    expect(data.placeholderPullRequests).toEqual([]);
    expect(data.mappedPullRequests[0]).toMatchObject({ url: 'https://github.com/acme/widgets/pull/1', state: 'merged', merged_at: 1767225600 });

    const pr1 = `pr_${H(1).slice(0, 12)}`;
    const pr2 = `pr_${H(2).slice(0, 12)}`;
    expect(data.authored).toEqual([{ author_id: ALICE, pr_id: pr1 }, { author_id: BOB, pr_id: pr2 }]);
    expect(data.reviews).toEqual([
      { reviewer_id: BOB, pr_id: pr1, state: 'APPROVED', count: 2, last_at: 1767268800 },
      { reviewer_id: 'gh_carol-gh', pr_id: pr1, state: 'APPROVED', count: 1, last_at: 1767261600 },
      { reviewer_id: ALICE, pr_id: pr2, state: 'APPROVED', count: 1, last_at: 1767261600 },
    ]);
    expect(input.identity.newPersons).toEqual([{ id: 'gh_carol-gh', login: 'carol-gh' }]);
    expect(input.identity.linkedPersons).toEqual(expect.arrayContaining([{ id: ALICE, login: 'alice-gh' }, { id: BOB, login: 'bob-gh' }]));
  });

  it('creates pr_gh_<n> placeholders when the merge commit is not in the mined history, and uses an existing node for a known number', async () => {
    const commits = [gitCommit(1, ALICE)];
    const api = fakeApi({ pulls: [pull(7, 'alice-gh', H(9)), pull(8, 'alice-gh', null), pull(9, 'alice-gh', H(1))] });
    const data = await collectGitHubData(
      baseInput(api, commits, {
        lookupExistingPrIds: async () => new Map([[9, 'pr_existing_for_9']]),
      })
    );
    expect(data.placeholderPullRequests.map((p) => p.id)).toEqual(['pr_gh_7', 'pr_gh_8']);
    // #9 already lives on another node (PullRequest.number is unique): that node is kept, never duplicated
    expect(data.mappedPullRequests.map((p) => p.id)).toEqual(['pr_existing_for_9']);
  });

  it('retires a pr_gh_ placeholder once the PR\'s merge commit is in the history', async () => {
    const commits = [gitCommit(1, ALICE)];
    const api = fakeApi({ pulls: [pull(4, 'alice-gh', H(1))] });
    const data = await collectGitHubData(
      baseInput(api, commits, { lookupExistingPrIds: async () => new Map([[4, 'pr_gh_4']]) })
    );
    expect(data.retirePlaceholderIds).toEqual(['pr_gh_4']);
    expect(data.mappedPullRequests.map((p) => p.id)).toEqual([`pr_${H(1).slice(0, 12)}`]);
    expect(data.placeholderPullRequests).toEqual([]);
  });

  it('two PRs can never claim the same node', async () => {
    const api = fakeApi({ pulls: [pull(1, 'a', H(1)), pull(2, 'a', H(1))] });
    const data = await collectGitHubData(baseInput(api, [gitCommit(1, ALICE)]));
    expect(data.mappedPullRequests.map((p) => p.number)).toEqual([1]);
    expect(data.placeholderPullRequests.map((p) => p.number)).toEqual([2]);
  });

  it('links closing references to known issues; looks up older issues one by one; ignores unknown / cross-repo numbers', async () => {
    const api = fakeApi({
      pulls: [
        pull(1, 'alice-gh', H(1), { body: 'Fixes #10, closes #11 and resolves #404. Fixes other/repo#10' }),
        pull(2, 'alice-gh', H(2), { title: 'Closes #12 (a PR number, not an issue)' }),
      ],
      issues: [issue(10, 'closed'), issue(11), issue(55)],
    });
    // #11 is not in the listing window: it must be fetched individually
    const listing = api.listIssues;
    api.listIssues = async (a) => (await listing(a)).filter((i) => i.number !== 11);
    const data = await collectGitHubData(baseInput(api, [gitCommit(1, ALICE), gitCommit(2, ALICE)]));

    expect(data.issues.map((i) => i.id).sort()).toEqual(['issue_10', 'issue_11', 'issue_55']);
    expect(data.issues.find((i) => i.id === 'issue_10')).toMatchObject({ state: 'closed', url: 'https://github.com/acme/widgets/issues/10', title: 'Issue 10' });
    const pr1 = `pr_${H(1).slice(0, 12)}`;
    expect(data.closes).toEqual([{ pr_id: pr1, issue_id: 'issue_10' }, { pr_id: pr1, issue_id: 'issue_11' }]);
    expect(api.calls).toContain('issue#11');
    expect(api.calls).toContain('issue#404'); // looked up, does not exist => no edge
    expect(data.closes.some((c) => c.issue_id === 'issue_404')).toBe(false);
  });

  it('attributes a merge commit\'s files through filesForCommit', async () => {
    const merge = gitCommit(1, ALICE, []); // `git log` lists no files for merge commits
    const api = fakeApi({ pulls: [pull(5, 'alice-gh', H(1))] });
    const filesForCommit = vi.fn(async () => ['packages/auth/session.ts', 'packages/auth/jwt.ts']);
    const data = await collectGitHubData(baseInput(api, [merge], { filesForCommit }));
    expect(filesForCommit).toHaveBeenCalledWith(H(1));
    expect(data.extraTouches).toEqual([
      { pr_id: `pr_${H(1).slice(0, 12)}`, file_path: 'packages/auth/session.ts' },
      { pr_id: `pr_${H(1).slice(0, 12)}`, file_path: 'packages/auth/jwt.ts' },
    ]);
    // a commit that already lists files does not trigger the diff
    filesForCommit.mockClear();
    await collectGitHubData(baseInput(fakeApi({ pulls: [pull(6, 'a', H(2))] }), [gitCommit(2, ALICE, ['packages/auth/x.ts'])], { filesForCommit }));
    expect(filesForCommit).not.toHaveBeenCalled();
  });

  it('mines decisions from review comments and attaches the PR\'s dominant component', async () => {
    const commits = [gitCommit(1, ALICE, ['packages/billing/a.ts', 'packages/billing/b.ts', 'packages/auth/c.ts'])];
    const api = fakeApi({
      pulls: [pull(1, 'alice-gh', H(1))],
      reviews: { 1: [review(1, 'carol-gh', 'COMMENTED', '2026-01-01T10:00:00Z', 'LGTM. We decided to use exponential backoff for every retry in billing from now on.')] },
    });
    const data = await collectGitHubData(baseInput(api, commits));
    expect(data.commentDecisions).toHaveLength(1);
    expect(data.commentDecisions[0]).toMatchObject({
      source_kind: 'comment', component_name: 'packages/billing', origin_pr: `pr_${H(1).slice(0, 12)}`,
      source_url: 'https://github.com/acme/widgets/pull/1#r1',
    });
  });

  it('reads the changed files of PRs outside the mined history (merged into another branch) so their reviews still count', async () => {
    const commits = [gitCommit(1, ALICE, ['packages/billing/a.ts'])];
    const listPullFiles = vi.fn(async ({ number }: { number: number }) => (number === 7 ? ['packages/auth/jwt.ts', 'packages/auth/x.ts'] : []));
    const api = fakeApi(
      { pulls: [pull(1, 'alice-gh', H(1)), pull(7, 'alice-gh', H(9))], reviews: { 7: [review(1, 'bob-gh', 'COMMENTED', '2026-01-01T10:00:00Z', 'We decided to cache tokens for one hour in auth going forward.')] } },
      { listPullFiles }
    );
    const data = await collectGitHubData(baseInput(api, commits));
    // only the PR whose merge commit is NOT in history is looked up
    expect(listPullFiles).toHaveBeenCalledTimes(1);
    expect(listPullFiles).toHaveBeenCalledWith(expect.objectContaining({ number: 7 }));
    expect(data.extraTouches).toEqual([
      { pr_id: 'pr_gh_7', file_path: 'packages/auth/jwt.ts' },
      { pr_id: 'pr_gh_7', file_path: 'packages/auth/x.ts' },
    ]);
    // and the decision stated in its review now has a component to govern
    expect(data.commentDecisions[0]).toMatchObject({ component_name: 'packages/auth', origin_pr: 'pr_gh_7' });
  });

  it('never looks up PR files without a budget (anonymous mode) or without API support', async () => {
    const listPullFiles = vi.fn(async () => ['packages/auth/jwt.ts']);
    const pulls = [pull(7, 'a', H(9))];
    await collectGitHubData(baseInput(fakeApi({ pulls }, { listPullFiles }), [gitCommit(1, ALICE)], { limits: ANONYMOUS_LIMITS }));
    expect(listPullFiles).not.toHaveBeenCalled();
    const bare = fakeApi({ pulls });
    delete (bare as any).listPullFiles;
    const data = await collectGitHubData(baseInput(bare, [gitCommit(1, ALICE)]));
    expect(data.extraTouches).toEqual([]);
  });

  it('is best effort: a rate limit mid-way keeps what was read, skips the rest and says so', async () => {
    let reviewCalls = 0;
    const api = fakeApi(
      { pulls: [pull(1, 'a', H(1)), pull(2, 'a', H(2)), pull(3, 'a', H(3))], issues: [issue(1)] },
      {
        listReviews: async () => {
          reviewCalls++;
          if (reviewCalls > 1) throw new GitHubRateLimitError('API rate limit exceeded');
          return [review(1, 'bob-gh')];
        },
      }
    );
    const data = await collectGitHubData(baseInput(api, [gitCommit(1, ALICE), gitCommit(2, ALICE), gitCommit(3, ALICE)], { limits: { ...AUTHENTICATED_LIMITS, concurrency: 1 } }));
    expect(data.status).toBe('partial');
    expect(data.notes.join(' ')).toMatch(/rate limit/i);
    expect(data.mappedPullRequests).toHaveLength(3); // PRs themselves survive
    expect(data.reviews).toHaveLength(1);
    expect(reviewCalls).toBe(2); // no hammering after the limit was hit
    expect(api.calls).not.toContain('issues'); // later steps are skipped once limited
    expect(data.issues).toEqual([]);
  });

  it('is best effort: an unexpected API error (no access, outage) yields partial data, not an exception', async () => {
    const denied = Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
    const api = fakeApi({}, { listMergedPulls: async () => { throw denied; }, listIssues: async () => { throw denied; } });
    const data = await collectGitHubData(baseInput(api, [gitCommit(1, ALICE)]));
    expect(data.status).toBe('partial');
    expect(data.notes.length).toBeGreaterThanOrEqual(2);
    expect(data.notes[0]).toContain('HTTP 403');
    expect(data.mappedPullRequests).toEqual([]);
  });

  it('redacts secrets from titles / bodies and truncates long text', async () => {
    const api = fakeApi({
      pulls: [pull(1, 'a', H(1), { title: 'Use token ghp_abcdefghijklmnopqrstuvwxyz0123456789', body: `${'x'.repeat(500)} https://user:pw@github.com/a/b` })],
    });
    const data = await collectGitHubData(baseInput(api, [gitCommit(1, ALICE)]));
    expect(data.mappedPullRequests[0]!.title).not.toContain('ghp_abc');
    expect(data.mappedPullRequests[0]!.body_excerpt.length).toBeLessThanOrEqual(300);
  });

  it('anonymous mode uses far smaller caps (60 requests/hour) and skips commit-login mapping', async () => {
    expect(ANONYMOUS_LIMITS.maxPullRequests).toBeLessThan(AUTHENTICATED_LIMITS.maxPullRequests);
    expect(ANONYMOUS_LIMITS.maxCommitLogins).toBe(0);
    const api = fakeApi({ pulls: [pull(1, 'a', H(1))] });
    await collectGitHubData(baseInput(api, [gitCommit(1, ALICE)], { limits: ANONYMOUS_LIMITS }));
    expect(api.calls).not.toContain('logins');
  });

  it('passes `since` to the API so a re-sync only reads recent activity', async () => {
    const seen: Array<string | undefined> = [];
    const api = fakeApi({}, {
      listMergedPulls: async ({ since }) => { seen.push(since); return []; },
      listIssues: async ({ since }) => { seen.push(since); return []; },
    });
    await collectGitHubData(baseInput(api, [], { since: '2026-02-01T00:00:00.000Z' }));
    expect(seen).toEqual(['2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']);
  });
});
