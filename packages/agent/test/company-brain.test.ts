import { describe, it, expect, vi } from 'vitest';
import { dispatchRetrievalBundle } from '../src/briefing/dispatcher.js';
import { executeBriefingPipeline } from '../src/briefing/pipeline.js';
import { aggregateWhoKnows, isHttpUrl, pullRequestRef, sourceKindFromUrl } from '../src/briefing/provenance.js';
import { buildBriefingPrompt } from '../src/briefing/prompt.js';
import type { GatewayClient } from '../src/client/types.js';
import type { ResolvedScope } from '../src/briefing/types.js';
import type { ArgonEmbedder } from '@argon/graph';

const payload = (raw: unknown[], primaryIds: string[] = []) => ({
  raw,
  graph: { nodes: [], edges: [] },
  evidence: { nodeCount: raw.length, edgeCount: 0, primaryIds },
});

const scope: ResolvedScope = {
  files: ['src/billing/retry.ts'],
  components: ['billing'],
  queryVector: new Array(512).fill(0.05),
  rawTask: 'Refactor src/billing/retry.ts',
  asOf: 1_700_000_000,
};

describe('aggregateWhoKnows (3.2: authored / reviewed are separate, never multiplied)', () => {
  it('REGRESSION: a PR with two reviewers is counted once for its author', () => {
    // exact row shape the fixed query returns: one authored row, one row per reviewer
    const rows = [
      { component: 'billing', authorId: 'alice', authorName: 'Alice', authoredCount: 1, reviewerId: null, reviewedCount: 0 },
      { component: 'billing', authorId: null, authoredCount: 0, reviewerId: 'bob', reviewerName: 'Bob', reviewedCount: 1 },
      { component: 'billing', authorId: null, authoredCount: 0, reviewerId: 'carol', reviewerName: 'Carol', reviewedCount: 1 },
    ];
    const { keyOwners } = aggregateWhoKnows(rows);
    const alice = keyOwners.find((o) => o.personId === 'alice')!;
    expect(alice.authoredCount).toBe(1);
    expect(alice.reviewedCount).toBe(0);
    expect(keyOwners.find((o) => o.personId === 'bob')).toMatchObject({ authoredCount: 0, reviewedCount: 1 });
    expect(keyOwners.find((o) => o.personId === 'carol')).toMatchObject({ authoredCount: 0, reviewedCount: 1 });
  });

  it('merges a person who both authors and reviews, picks their most active component, sorts by activity', () => {
    const { keyOwners } = aggregateWhoKnows([
      { component: 'billing', authorId: 'alice', authorName: 'Alice', authoredCount: 2, reviewedCount: 0 },
      { component: 'auth', authorId: 'alice', authorName: 'Alice', authoredCount: 5, reviewedCount: 0 },
      { component: 'auth', reviewerId: 'alice', reviewerName: 'Alice', authoredCount: 0, reviewedCount: 3 },
      { component: 'billing', authorId: 'zed', authorName: 'Zed', authoredCount: 1, reviewedCount: 0 },
    ]);
    expect(keyOwners.map((o) => o.personId)).toEqual(['alice', 'zed']);
    expect(keyOwners[0]).toMatchObject({ authoredCount: 7, reviewedCount: 3, component: 'auth' });
  });

  it('collects CODEOWNERS owners of record and flags people who are also owners', () => {
    const { keyOwners, codeOwners, nodeIds } = aggregateWhoKnows([
      { component: 'billing', authorId: 'alice', authorName: 'Alice', authoredCount: 2, reviewedCount: 0 },
      { component: 'billing', ownerId: 'alice', ownerName: 'Alice', ownerPattern: '/src/billing/' },
      { component: 'billing', ownerId: '@acme/payments', ownerName: 'payments', ownerPattern: '/src/billing/' },
      // duplicate row must not duplicate the owner
      { component: 'billing', ownerId: '@acme/payments', ownerName: 'payments', ownerPattern: '/src/billing/' },
    ]);
    expect(codeOwners).toEqual([
      { ownerId: 'alice', name: 'Alice', component: 'billing', pattern: '/src/billing/', kind: 'person' },
      { ownerId: '@acme/payments', name: 'payments', component: 'billing', pattern: '/src/billing/', kind: 'team' },
    ]);
    expect(keyOwners[0]!.isCodeOwner).toBe(true);
    expect(nodeIds).toEqual(expect.arrayContaining(['alice', '@acme/payments']));
  });

  it('tolerates empty / null rows and still handles the legacy combined row shape', () => {
    expect(aggregateWhoKnows([])).toEqual({ keyOwners: [], codeOwners: [], nodeIds: [] });
    const legacy = aggregateWhoKnows([
      { component: 'x', authorId: 'a', authorName: 'A', authoredCount: '3', reviewerId: 'b', reviewerName: 'B', reviewedCount: 8 },
    ]);
    expect(legacy.keyOwners.map((o) => [o.personId, o.authoredCount, o.reviewedCount])).toEqual([
      ['b', 0, 8],
      ['a', 3, 0],
    ]);
  });
});

describe('provenance helpers', () => {
  it('only treats absolute http(s) URLs as clickable', () => {
    expect(isHttpUrl('https://github.com/o/r/pull/3')).toBe(true);
    expect(isHttpUrl('commit://abc123')).toBe(false);
    expect(isHttpUrl('docs/adr/001.md')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });

  it('classifies GitHub URLs and renders PR references', () => {
    expect(sourceKindFromUrl('https://github.com/o/r/commit/0123456789ab')).toBe('commit');
    expect(sourceKindFromUrl('https://github.com/o/r/pull/12')).toBe('pull_request');
    expect(sourceKindFromUrl('https://github.com/o/r/issues/7')).toBe('issue');
    expect(sourceKindFromUrl('https://github.com/o/r/blob/abc/docs/adr/1.md')).toBe('document');
    expect(pullRequestRef(12, 'pr_x')).toBe('#12');
    expect(pullRequestRef(undefined, 'pr_abc')).toBe('pr_abc');
    expect(pullRequestRef(0, 'pr_abc')).toBe('pr_abc');
  });
});

describe('dispatcher: provenance (3.1 / 3.7)', () => {
  function client(map: Record<string, unknown>): GatewayClient {
    return {
      executeQuery: vi.fn(async (_ws: string, name: string) => map[name] ?? payload([])),
    } as unknown as GatewayClient;
  }

  it('builds PR and issue links for constraining decisions and adds them to the citable ids', async () => {
    const res = await dispatchRetrievalBundle(
      client({
        constrainingDecisions: payload(
          [
            {
              id: 'dec_commit_aaa', title: 'Move to exp backoff', status: 'accepted', component: 'billing',
              sourceUrl: 'https://github.com/o/r/commit/aaaaaaaaaaaa',
              prId: 'pr_aaaaaaaaaaaa', prNumber: 12, prUrl: 'https://github.com/o/r/pull/12',
              issueId: 'issue_7', issueNumber: 7, issueUrl: 'https://github.com/o/r/issues/7', issueState: 'closed',
            },
            // same decision again for another component: must not duplicate
            {
              id: 'dec_commit_aaa', title: 'Move to exp backoff', status: 'accepted', component: 'ledger',
              sourceUrl: 'https://github.com/o/r/commit/aaaaaaaaaaaa',
              prId: 'pr_aaaaaaaaaaaa', prNumber: 12, prUrl: 'https://github.com/o/r/pull/12',
              issueId: 'issue_7', issueNumber: 7, issueUrl: 'https://github.com/o/r/issues/7', issueState: 'closed',
            },
            // decision without provenance and with a non-clickable origin
            { id: 'ADR-9', title: 'Plain', status: 'accepted', component: 'billing', sourceUrl: 'docs/adr/009.md' },
          ],
          ['dec_commit_aaa', 'ADR-9']
        ),
      }),
      'ws',
      scope
    );
    expect(res.status).toBe('SUCCESS');
    const b = res.bundle!;
    expect(b.constrainingDecisions).toHaveLength(2);
    expect(b.constrainingDecisions[0]).toMatchObject({
      decisionId: 'dec_commit_aaa', pullRequestId: 'pr_aaaaaaaaaaaa', pullRequestNumber: 12,
      issueId: 'issue_7', issueNumber: 7,
    });
    expect(b.allNodeIds.has('pr_aaaaaaaaaaaa')).toBe(true);
    expect(b.allNodeIds.has('issue_7')).toBe(true);

    const urls = b.sources!.map((s) => [s.kind, s.nodeId, s.url, s.relatedTo]);
    expect(urls).toEqual(
      expect.arrayContaining([
        ['commit', 'dec_commit_aaa', 'https://github.com/o/r/commit/aaaaaaaaaaaa', 'dec_commit_aaa'],
        ['pull_request', 'pr_aaaaaaaaaaaa', 'https://github.com/o/r/pull/12', 'dec_commit_aaa'],
        ['issue', 'issue_7', 'https://github.com/o/r/issues/7', 'dec_commit_aaa'],
      ])
    );
    // no duplicates, no entries for the relative path
    expect(b.sources).toHaveLength(3);
    expect(b.sources!.every((s) => s.nodeId !== 'ADR-9')).toBe(true);
  });

  it('precedents: one entry per decision, PR falls back to the node id when it has no number', async () => {
    const dec = (id: string, extra: object = {}) => ({
      id: 1, labels: ['Decision'], properties: { id, title: `T ${id}`, status: 'superseded', source_url: 'https://github.com/o/r/commit/bbbbbbbbbbbb', ...extra },
    });
    const res = await dispatchRetrievalBundle(
      client({
        precedentSearch: payload(
          [
            // numberless commit-level PR (what ingest writes without GitHub data) + 2 governed components
            { decision: dec('dec_commit_bbb'), score: 0.9, component: { properties: { name: 'billing' } },
              pullRequest: { id: 3, labels: ['PullRequest'], properties: { id: 'pr_bbbbbbbbbbbb', title: 'x' } }, issue: null },
            { decision: dec('dec_commit_bbb'), score: 0.9, component: { properties: { name: 'ledger' } },
              pullRequest: { id: 3, labels: ['PullRequest'], properties: { id: 'pr_bbbbbbbbbbbb', title: 'x' } }, issue: null },
            // GitHub-enriched PR + issue
            { decision: dec('dec_gh', { source_url: 'docs/x.md' }), score: 0.8, component: { properties: { name: 'billing' } },
              pullRequest: { id: 4, labels: ['PullRequest'], properties: { id: 'pr_gh_5', number: 5, url: 'https://github.com/o/r/pull/5' } },
              issue: { id: 5, labels: ['Issue'], properties: { id: 'issue_9', number: 9, url: 'https://github.com/o/r/issues/9', state: 'open', title: 'Storm' } } },
          ],
          ['dec_commit_bbb', 'dec_gh']
        ),
      }),
      'ws',
      scope
    );
    const p = res.bundle!.precedents;
    expect(p.map((x) => x.decisionId)).toEqual(['dec_commit_bbb', 'dec_gh']);
    expect(p[0]).toMatchObject({ pullRequest: 'pr_bbbbbbbbbbbb', pullRequestId: 'pr_bbbbbbbbbbbb' });
    expect(p[1]).toMatchObject({ pullRequest: '#5', issueId: 'issue_9', issueNumber: 9 });
    // a numberless commit PR has no url => no source link, but it is still citable
    const srcByNode = new Map(res.bundle!.sources!.map((s) => [`${s.kind}:${s.nodeId}`, s]));
    expect(srcByNode.has('pull_request:pr_bbbbbbbbbbbb')).toBe(false);
    expect(res.bundle!.allNodeIds.has('pr_bbbbbbbbbbbb')).toBe(true);
    expect(srcByNode.get('pull_request:pr_gh_5')?.url).toBe('https://github.com/o/r/pull/5');
    expect(srcByNode.get('issue:issue_9')).toMatchObject({ state: 'open', relatedTo: 'dec_gh' });
    expect(srcByNode.get('commit:dec_commit_bbb')?.url).toMatch(/commit\/b+$/);
  });

  it('who_knows rows reach keyOwners / codeOwners without inflating counts', async () => {
    const res = await dispatchRetrievalBundle(
      client({
        whoKnows: payload(
          [
            { component: 'billing', authorId: 'alice', authorName: 'Alice', authoredCount: 1, reviewedCount: 0 },
            { component: 'billing', reviewerId: 'bob', reviewerName: 'Bob', authoredCount: 0, reviewedCount: 1 },
            { component: 'billing', reviewerId: 'carol', reviewerName: 'Carol', authoredCount: 0, reviewedCount: 1 },
            { component: 'billing', ownerId: '@acme/payments', ownerName: 'payments', ownerPattern: '/src/billing/', authoredCount: 0, reviewedCount: 0 },
          ],
          ['billing']
        ),
        blastRadius: payload([{ f: { path: 'src/billing/retry.ts' }, c: { name: 'billing' } }]),
      }),
      'ws',
      scope
    );
    const b = res.bundle!;
    expect(b.keyOwners.find((o) => o.personId === 'alice')).toMatchObject({ authoredCount: 1, reviewedCount: 0 });
    expect(b.keyOwners).toHaveLength(3);
    expect(b.codeOwners).toEqual([
      { ownerId: '@acme/payments', name: 'payments', component: 'billing', pattern: '/src/billing/', kind: 'team' },
    ]);
    expect(b.allNodeIds.has('@acme/payments')).toBe(true);
  });

  it('revert PRs with a GitHub url become sources', async () => {
    const res = await dispatchRetrievalBundle(
      client({
        revertHistory: payload(
          [
            {
              node: { id: 1, labels: ['PullRequest'], properties: { id: 'pr_rev', title: 'Revert x', number: 42, url: 'https://github.com/o/r/pull/42' } },
              reverted: { id: 2, labels: ['PullRequest'], properties: { id: 'pr_orig' } },
              files: ['src/billing/retry.ts'],
            },
          ],
          ['pr_rev']
        ),
        blastRadius: payload([{ f: { path: 'src/billing/retry.ts' }, c: { name: 'billing' } }]),
      }),
      'ws',
      scope
    );
    expect(res.bundle!.reverts[0]).toMatchObject({ id: 'pr_rev', number: 42, url: 'https://github.com/o/r/pull/42' });
    expect(res.bundle!.sources).toContainEqual(
      expect.objectContaining({ kind: 'pull_request', nodeId: 'pr_rev', url: 'https://github.com/o/r/pull/42' })
    );
  });
});

describe('prompt + pipeline response carry provenance', () => {
  it('prompt lists PR / issue node ids with their URLs and the CODEOWNERS block', () => {
    const prompt = buildBriefingPrompt('t', {
      touchedFiles: [], blastComponents: [], keyOwners: [
        { personId: 'alice', name: 'Alice', component: 'billing', authoredCount: 2, reviewedCount: 3, isCodeOwner: true },
      ],
      constrainingDecisions: [
        {
          decisionId: 'D1', title: 'Backoff', component: 'billing', status: 'accepted',
          sourceUrl: 'https://github.com/o/r/commit/abc',
          pullRequestId: 'pr_gh_5', pullRequestNumber: 5, pullRequestUrl: 'https://github.com/o/r/pull/5',
          issueId: 'issue_9', issueNumber: 9, issueUrl: 'https://github.com/o/r/issues/9',
        },
      ],
      precedents: [], reverts: [], riskRanking: [],
      codeOwners: [{ ownerId: '@acme/payments', name: 'payments', component: 'billing', pattern: '/src/billing/', kind: 'team' }],
      toolFindings: [], allNodeIds: new Set(), cytoscapeElements: [],
    });
    expect(prompt).toContain('Reviewed PRs: 3, CODEOWNERS owner of record');
    expect(prompt).toContain('from PR #5 [NodeId: "pr_gh_5"] https://github.com/o/r/pull/5');
    expect(prompt).toContain('closed Issue #9 [NodeId: "issue_9"] https://github.com/o/r/issues/9');
    expect(prompt).toContain('<CODE_OWNERS>');
    expect(prompt).toContain('[NodeId: "@acme/payments"] payments owns billing (CODEOWNERS pattern /src/billing/, team)');
  });

  it('a SUCCESS briefing returns sources and codeOwners built from the graph', async () => {
    const embedder = { embed: async () => ({ vector: new Array(512).fill(0.05) }) } as unknown as ArgonEmbedder;
    const client = {
      executeQuery: vi.fn(async (_ws: string, name: string) => {
        switch (name) {
          case 'resolveScope':
            return payload([{ matchedFiles: [{ properties: { path: 'src/billing/retry.ts' } }], allComponents: [{ properties: { name: 'billing' } }] }]);
          case 'blastRadius':
            return payload([{ f: { properties: { path: 'src/billing/retry.ts' } }, c: { properties: { name: 'billing' } } }], ['billing']);
          case 'whoKnows':
            return payload([
              { component: 'billing', authorId: 'p1', authorName: 'Alice', authoredCount: 4, reviewedCount: 0 },
              { component: 'billing', ownerId: '@acme/payments', ownerName: 'payments', ownerPattern: '/src/billing/' },
            ]);
          case 'constrainingDecisions':
            return payload(
              [{ id: 'DEC-002', title: 'Exp backoff', status: 'active', component: 'billing', sourceUrl: 'https://github.com/o/r/commit/abc123456789', prId: 'pr_gh_5', prNumber: 5, prUrl: 'https://github.com/o/r/pull/5', issueId: 'issue_9', issueNumber: 9, issueUrl: 'https://github.com/o/r/issues/9' }],
              ['DEC-002']
            );
          default:
            return payload([]);
        }
      }),
    } as unknown as GatewayClient;

    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', toolSelection: false,
      request: { task: 'Refactor src/billing/retry.ts', files: ['src/billing/retry.ts'] },
      customGenerator: async () => ({
        summary: {
          overview: 'o', riskLevel: 'low',
          // the narrator cites the PR and the issue ids it was shown
          keyTakeaways: [{ claim: 'DEC-002 came from PR #5 which closed issue #9.', citedNodeIds: ['DEC-002', 'pr_gh_5', 'issue_9'] }],
        },
        blastRadius: { analysis: 'a', affectedComponents: [] },
        keyOwners: [], constrainingDecisions: [], precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    // PR and issue ids are verified citations (they exist in the evidence)
    expect((res.evidence as any).verifiedNodeIds).toEqual(expect.arrayContaining(['DEC-002', 'pr_gh_5', 'issue_9']));
    expect(res.sources!.map((s) => s.url)).toEqual(
      expect.arrayContaining([
        'https://github.com/o/r/commit/abc123456789',
        'https://github.com/o/r/pull/5',
        'https://github.com/o/r/issues/9',
      ])
    );
    expect(res.codeOwners).toEqual([
      { ownerId: '@acme/payments', name: 'payments', component: 'billing', pattern: '/src/billing/', kind: 'team' },
    ]);
  });

  it('a fabricated PR / issue id is still stripped (fail-closed citation integrity is unchanged)', async () => {
    const embedder = { embed: async () => ({ vector: new Array(512).fill(0.05) }) } as unknown as ArgonEmbedder;
    const client = {
      executeQuery: vi.fn(async (_ws: string, name: string) => {
        if (name === 'blastRadius')
          return payload([{ f: { properties: { path: 'src/billing/retry.ts' } }, c: { properties: { name: 'billing' } } }], ['billing']);
        return payload([]);
      }),
    } as unknown as GatewayClient;
    const res = await executeBriefingPipeline({
      client, embedder, workspaceId: 'ws', toolSelection: false,
      request: { task: 'x', files: ['src/billing/retry.ts'] },
      customGenerator: async () => ({
        summary: {
          overview: 'o', riskLevel: 'low',
          keyTakeaways: [
            { claim: 'grounded', citedNodeIds: ['billing'] },
            { claim: 'invented PR', citedNodeIds: ['pr_gh_999'] },
          ],
        },
        blastRadius: { analysis: 'a', affectedComponents: [] },
        keyOwners: [], constrainingDecisions: [], precedents: [],
      }),
    });
    expect(res.status).toBe('SUCCESS');
    expect((res.briefing as any).summary.keyTakeaways.map((t: any) => t.claim)).toEqual(['grounded']);
  });
});
