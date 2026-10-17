import { describe, it, expect } from 'vitest';
import {
  parseGitHubRepo, commitUrl, pullUrl, issueUrl, blobUrl,
  parseClosingReferences,
  IdentityResolver, isBotLogin, githubPersonId,
  parseCodeOwners, codeOwnersPatternToRegex, ownersOfFile, computeComponentOwnership, classifyOwner,
  mineCommentDecisions,
  applyDecisionProvenance, commitNodeId,
  hashAuthorEmail,
  type GitCommit, type MinedDecision, type ComponentDefinition,
} from '../src/index.js';

const commit = (hash: string, authorId = 'a'): GitCommit => ({
  hash, message: 'm', summary: 'm', author: { id: authorId, name: authorId, emailHash: authorId },
  timestamp: 1, parents: [], files: [],
});

describe('parseGitHubRepo / URL builders', () => {
  it('accepts plain github.com https URLs only', () => {
    expect(parseGitHubRepo('https://github.com/acme/widgets')).toMatchObject({ owner: 'acme', repo: 'widgets', webUrl: 'https://github.com/acme/widgets' });
    expect(parseGitHubRepo('https://github.com/acme/widgets.git')?.repo).toBe('widgets');
    expect(parseGitHubRepo('https://x-access-token:SECRET@github.com/acme/widgets')?.webUrl).toBe('https://github.com/acme/widgets');
    expect(parseGitHubRepo('https://github.com/acme/widgets/tree/main')?.repo).toBe('widgets');
    for (const bad of ['file:///tmp/x', '/tmp/repo', 'http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com/a', 'https://github.com/../b', '', undefined, null, 'not a url']) {
      expect(parseGitHubRepo(bad as any)).toBeNull();
    }
  });

  it('builds commit / pull / issue / blob permalinks', () => {
    const r = parseGitHubRepo('https://github.com/acme/widgets')!;
    expect(commitUrl(r, 'abc123')).toBe('https://github.com/acme/widgets/commit/abc123');
    expect(pullUrl(r, 7)).toBe('https://github.com/acme/widgets/pull/7');
    expect(issueUrl(r, 9)).toBe('https://github.com/acme/widgets/issues/9');
    expect(blobUrl(r, 'abc123', 'docs/adr/001 retry.md')).toBe('https://github.com/acme/widgets/blob/abc123/docs/adr/001%20retry.md');
  });
});

describe('parseClosingReferences', () => {
  const repo = { owner: 'acme', repo: 'widgets' };
  it('finds closing keywords in every common form', () => {
    expect(parseClosingReferences('Fixes #12', repo)).toEqual([12]);
    expect(parseClosingReferences('closes: #3, #4 and #5', repo)).toEqual([3, 4, 5]);
    expect(parseClosingReferences('Resolved #8\nfixed #9', repo)).toEqual([8, 9]);
    expect(parseClosingReferences('Resolves acme/widgets#15', repo)).toEqual([15]);
    expect(parseClosingReferences('fixes https://github.com/acme/widgets/issues/21', repo)).toEqual([21]);
    expect(parseClosingReferences('CLOSES #2', repo)).toEqual([2]);
  });

  it('ignores mentions that do not close, other repositories, and code', () => {
    expect(parseClosingReferences('See #12 for background, related to #13', repo)).toEqual([]);
    expect(parseClosingReferences('Fixes other/repo#4', repo)).toEqual([]);
    expect(parseClosingReferences('Use `Fixes #1` in the PR body', repo)).toEqual([]);
    expect(parseClosingReferences('```\nFixes #1\n```', repo)).toEqual([]);
    expect(parseClosingReferences('prefixes #4', repo)).toEqual([]);
    expect(parseClosingReferences('', repo)).toEqual([]);
    expect(parseClosingReferences(null, repo)).toEqual([]);
  });
});

describe('IdentityResolver (login -> Person)', () => {
  const people = [
    { id: hashAuthorEmail('alice@company.com'), name: 'Alice C' },
    { id: hashAuthorEmail('bob@company.com'), name: 'bobby' },
    { id: hashAuthorEmail('dana@x.com'), name: 'Dana' },
    { id: hashAuthorEmail('dana@y.com'), name: 'Dana' },
    { id: hashAuthorEmail('42+erin@users.noreply.github.com'), name: 'Erin E' },
  ];
  const [alice, bob] = people;

  it('uses GitHub commit attribution (majority vote) first', () => {
    const r = new IdentityResolver(people);
    r.observe('alice-gh', alice!.id);
    r.observe('alice-gh', alice!.id);
    r.observe('Alice-GH', bob!.id); // one noisy vote loses, and logins are case-insensitive
    expect(r.resolve('alice-gh')).toBe(alice!.id);
    expect(r.linkedPersons).toEqual([{ id: alice!.id, login: 'alice-gh' }]);
    expect(r.newPersons).toEqual([]);
  });

  it('falls back to noreply email hashes, then a unique name match, then a gh_ person', () => {
    const r = new IdentityResolver(people);
    expect(r.resolve('erin', 42)).toBe(people[4]!.id);
    expect(r.resolve('bobby')).toBe(bob!.id);
    // ambiguous name (two Danas) must not be guessed
    expect(r.resolve('Dana')).toBe(githubPersonId('Dana'));
    expect(r.resolve('carol-gh')).toBe('gh_carol-gh');
    expect(r.newPersons).toEqual([
      { id: 'gh_dana', login: 'Dana' },
      { id: 'gh_carol-gh', login: 'carol-gh' },
    ]);
  });

  it('is stable across calls and recognises bots / emails', () => {
    const r = new IdentityResolver(people);
    expect(r.resolve('zed')).toBe(r.resolve('ZED'));
    expect(r.resolveEmail('Alice@Company.com')).toBe(alice!.id);
    expect(r.resolveEmail('nobody@x.com')).toBeNull();
    expect(isBotLogin('dependabot[bot]')).toBe(true);
    expect(isBotLogin('carol')).toBe(false);
    expect(isBotLogin(null)).toBe(true);
  });

  it('ignores votes for unknown people', () => {
    const r = new IdentityResolver(people);
    r.observe('ghost', 'not-a-person');
    expect(r.resolve('ghost')).toBe('gh_ghost');
  });
});

describe('CODEOWNERS parsing and matching', () => {
  const owners = (rules: ReturnType<typeof parseCodeOwners>, file: string) => ownersOfFile(rules, file)?.owners;

  it('skips comments / blanks and keeps inline-comment-free rules', () => {
    const rules = parseCodeOwners(`# header\n\n*  @everyone  # trailing\n/docs/ @docs-team\n`);
    expect(rules.map((r) => [r.pattern, r.owners])).toEqual([['*', ['@everyone']], ['/docs/', ['@docs-team']]]);
  });

  it('last matching rule wins; a rule without owners un-owns', () => {
    const rules = parseCodeOwners('* @all\n/packages/billing/ @acme/payments @carol\n/packages/billing/generated/\n');
    expect(owners(rules, 'README.md')).toEqual(['@all']);
    expect(owners(rules, 'packages/billing/src/retry.ts')).toEqual(['@acme/payments', '@carol']);
    expect(owners(rules, 'packages/billing/generated/x.ts')).toEqual([]);
  });

  it('implements gitignore-style anchoring and wildcards', () => {
    const m = (pattern: string, file: string) => codeOwnersPatternToRegex(pattern).test(file);
    expect(m('*.js', 'a.js')).toBe(true);
    expect(m('*.js', 'src/deep/a.js')).toBe(true);
    expect(m('*.js', 'a.ts')).toBe(false);
    expect(m('/build/', 'build/out.js')).toBe(true);
    expect(m('/build/', 'src/build/out.js')).toBe(false);
    expect(m('build/', 'src/build/out.js')).toBe(true);
    expect(m('docs/*', 'docs/a.md')).toBe(true);
    expect(m('docs/*', 'docs/sub/a.md')).toBe(false); // wildcard matches one level only
    expect(m('docs/**', 'docs/sub/a.md')).toBe(true);
    expect(m('/src/**/test.ts', 'src/test.ts')).toBe(true);
    expect(m('/src/**/test.ts', 'src/a/b/test.ts')).toBe(true);
    expect(m('/apps/github', 'apps/github/x.ts')).toBe(true);
    expect(m('/apps/github', 'apps/githubber/x.ts')).toBe(false);
    expect(m('/a?c.ts', 'abc.ts')).toBe(true);
    expect(m('/a?c.ts', 'a/c.ts')).toBe(false);
    expect(m('/a.b', 'aXb')).toBe(false); // dots are literal
  });

  it('computes the owner of record per component by file coverage', () => {
    const rules = parseCodeOwners('* @all\n/packages/billing/ @acme/payments\n/packages/billing/src/legacy/ @legacy-guy\n');
    const components: ComponentDefinition[] = [
      { name: 'packages/billing', pathPrefix: 'packages/billing', files: ['packages/billing/src/a.ts', 'packages/billing/src/b.ts', 'packages/billing/src/legacy/c.ts'] },
      { name: 'packages/auth', pathPrefix: 'packages/auth', files: ['packages/auth/x.ts'] },
      { name: 'empty', pathPrefix: 'empty', files: [] },
    ];
    const result = computeComponentOwnership(rules, components);
    expect(result).toEqual([
      { component: 'packages/billing', owner: '@acme/payments', pattern: '/packages/billing/', coverage: 0.67 },
      { component: 'packages/auth', owner: '@all', pattern: '*', coverage: 1 },
    ]);
    // a minority owner (1 of 3 files) is not "of record"
    expect(result.find((r) => r.owner === '@legacy-guy')).toBeUndefined();
    // lowering the bar includes it
    expect(computeComponentOwnership(rules, components, 0.3).some((r) => r.owner === '@legacy-guy')).toBe(true);
  });

  it('classifies owner tokens', () => {
    expect(classifyOwner('@acme/payments')).toEqual({ kind: 'team', id: '@acme/payments', name: 'payments' });
    expect(classifyOwner('@Carol')).toEqual({ kind: 'user', login: 'Carol' });
    expect(classifyOwner('Dev@Example.com')).toEqual({ kind: 'email', email: 'dev@example.com' });
    expect(classifyOwner('garbage')).toBeNull();
  });
});

describe('mineCommentDecisions (conservative)', () => {
  const base = { prId: 'pr_x', prNumber: 3, component: 'packages/billing', login: 'carol', url: 'https://github.com/a/b/pull/3#r1', at: 100 };

  it('records explicit decisions with a link back to the comment', () => {
    const [d] = mineCommentDecisions([
      { ...base, text: 'Thanks for the PR. We decided to use exponential backoff for every retry in billing. Please update the docs.' },
    ]);
    expect(d).toMatchObject({
      source_kind: 'comment', status: 'accepted', valid_from: 100, valid_to: null,
      source_url: base.url, component_name: 'packages/billing', origin_pr: 'pr_x',
    });
    expect(d!.id).toMatch(/^dec_comment_3_[0-9a-f]{8}$/);
    expect(d!.title).toBe('We decided to use exponential backoff for every retry in billing.');
  });

  it('does not turn casual talk, bots, short text or component-less PRs into decisions', () => {
    const out = mineCommentDecisions([
      { ...base, text: 'Maybe we should use exponential backoff here? Not sure about the jitter.' },
      { ...base, login: 'dependabot[bot]', text: 'We decided to bump this dependency to the latest version available.' },
      { ...base, text: 'we decided to' },
      { ...base, component: undefined, text: 'We decided to use exponential backoff for every retry in billing.' },
      { ...base, login: null, text: 'We decided to use exponential backoff for every retry in billing.' },
    ]);
    expect(out).toEqual([]);
  });

  it('redacts secrets and de-duplicates identical comments', () => {
    const text = 'We decided to rotate the token ghp_abcdefghijklmnopqrstuvwxyz0123456789 weekly going forward.';
    const out = mineCommentDecisions([{ ...base, text }, { ...base, text }]);
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out[0])).not.toContain('ghp_abcdefghijklmnop');
  });
});

describe('applyDecisionProvenance (offline)', () => {
  const H1 = '1111111111111111111111111111111111111111';
  const H2 = '2222222222222222222222222222222222222222';
  const mk = (over: Partial<MinedDecision>): MinedDecision => ({
    id: 'd', title: 't', status: 'accepted', valid_from: 1, valid_to: null,
    source_url: 'orig', source_kind: 'commit', summary: 's', raw_text: 'r', ...over,
  });
  const repo = parseGitHubRepo('https://github.com/acme/widgets');

  it('links commit decisions and ADRs to the commit nodes and rewrites URLs for github.com repos', () => {
    const decisions = [
      mk({ id: 'dec_commit_1', source_url: `commit://${H2}`, origin_commit: H2 }),
      mk({ id: 'dec_adr', source_kind: 'adr', source_url: 'docs/adr/1.md', origin_path: 'docs/adr/1.md' }),
    ];
    const edges = applyDecisionProvenance({
      decisions, commits: [commit(H2), commit(H1)], repo,
      addCommits: new Map([['docs/adr/1.md', H1]]),
    });
    expect(edges).toEqual([
      { decision_id: 'dec_commit_1', pr_id: commitNodeId(H2) },
      { decision_id: 'dec_adr', pr_id: commitNodeId(H1) },
    ]);
    expect(decisions[0]!.source_url).toBe(`https://github.com/acme/widgets/commit/${H2}`);
    // ADR permalink points at the mined revision (HEAD = newest commit)
    expect(decisions[1]!.source_url).toBe(`https://github.com/acme/widgets/blob/${H2}/docs/adr/1.md`);
  });

  it('keeps non-link source_urls for non-GitHub repositories but still writes the edges', () => {
    const decisions = [mk({ id: 'dec_commit_1', source_url: `commit://${H1}`, origin_commit: H1 })];
    const edges = applyDecisionProvenance({ decisions, commits: [commit(H1)], repo: null });
    expect(edges).toEqual([{ decision_id: 'dec_commit_1', pr_id: commitNodeId(H1) }]);
    expect(decisions[0]!.source_url).toBe(`commit://${H1}`);
  });

  it('skips edges to commits outside the mined window and ADRs with unknown add commits', () => {
    const decisions = [
      mk({ id: 'old', origin_commit: H1 }),
      mk({ id: 'adr', source_kind: 'adr', origin_path: 'docs/x.md', source_url: 'docs/x.md' }),
    ];
    const edges = applyDecisionProvenance({ decisions, commits: [commit(H2)], repo, addCommits: new Map() });
    expect(edges).toEqual([]);
    // the ADR still gets a permalink at the mined revision
    expect(decisions[1]!.source_url).toBe(`https://github.com/acme/widgets/blob/${H2}/docs/x.md`);
  });

  it('links comment decisions to their pull request (including GitHub placeholders)', () => {
    const decisions = [mk({ id: 'c1', source_kind: 'comment', origin_pr: 'pr_gh_5', source_url: 'https://github.com/a/b/pull/5#r' }), mk({ id: 'c2', origin_pr: commitNodeId(H1) })];
    const edges = applyDecisionProvenance({ decisions, commits: [commit(H1)], repo });
    expect(edges).toEqual([{ decision_id: 'c1', pr_id: 'pr_gh_5' }, { decision_id: 'c2', pr_id: commitNodeId(H1) }]);
    expect(decisions[0]!.source_url).toBe('https://github.com/a/b/pull/5#r');
  });
});
