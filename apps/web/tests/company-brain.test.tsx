import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { EvidenceSource } from '@argon/agent';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { EvidenceCard } from '@/components/briefing/evidence-card';
import { WorkspaceSwitcher, storageKeyForOwner } from '@/components/workspace/workspace-switcher';
import {
  citationLinks, decisionProvenance, linkableSources, ownersOfRecord, sourceChipLabel,
} from '@/lib/briefing-sources';
import { startRefresh, waitForIngest, IngestNotStartedError } from '@/lib/ingest-client';

const PR = 'https://github.com/argon/synthetic-demo/pull/42';
const ISSUE = 'https://github.com/argon/synthetic-demo/issues/1042';
const COMMIT = 'https://github.com/argon/synthetic-demo/commit/0123456789ab';

const sources: EvidenceSource[] = [
  { nodeId: 'DEC-002', kind: 'commit', label: 'Exponential Backoff', url: COMMIT, relatedTo: 'DEC-002' },
  { nodeId: 'PR-042', kind: 'pull_request', label: 'PR #42 Revert linear backoff', url: PR, relatedTo: 'DEC-002' },
  { nodeId: 'issue_1042', kind: 'issue', label: 'Issue #1042 Retry storm', url: ISSUE, state: 'closed', relatedTo: 'DEC-002' },
  // attacker-controlled / non-link values must never become hrefs
  { nodeId: 'x', kind: 'pull_request', label: 'PR #1 evil', url: 'javascript:alert(1)', relatedTo: 'DEC-002' },
  { nodeId: 'y', kind: 'issue', label: 'Issue #2 relative', url: 'docs/adr/1.md', relatedTo: 'DEC-002' },
];

describe('briefing-sources helpers', () => {
  it('keeps only http(s) links', () => {
    expect(linkableSources(sources).map((s) => s.nodeId)).toEqual(['DEC-002', 'PR-042', 'issue_1042']);
    expect(linkableSources(null)).toEqual([]);
  });

  it('splits a decision\'s origin from the PR / issue it was extracted from (PR first)', () => {
    const swapped = [sources[2]!, sources[1]!, sources[0]!];
    const p = decisionProvenance(swapped, 'DEC-002');
    expect(p.origin?.url).toBe(COMMIT);
    expect(p.links.map((l) => l.kind)).toEqual(['pull_request', 'issue']);
    expect(decisionProvenance(sources, '#DEC-002').origin?.url).toBe(COMMIT); // '#'-prefixed ids work
    expect(decisionProvenance(sources, 'DEC-404')).toEqual({ origin: undefined, links: [] });
  });

  it('turns cited PR / issue ids into links, once each', () => {
    expect(citationLinks(sources, ['DEC-002', '#PR-042', 'PR-042', 'issue_1042', 'unknown']).map((s) => s.url)).toEqual([PR, ISSUE]);
    expect(citationLinks(undefined, ['PR-042'])).toEqual([]);
    expect(citationLinks(sources, undefined)).toEqual([]);
  });

  it('labels chips compactly and filters owners of record by component', () => {
    expect(sourceChipLabel(sources[1]!)).toBe('PR #42');
    expect(sourceChipLabel(sources[2]!)).toBe('Issue #1042');
    expect(sourceChipLabel({ nodeId: 'a', kind: 'commit', label: 'x' })).toBe('Commit');
    const owners = [
      { ownerId: '@a/b', name: 'b', component: 'billing', kind: 'team' as const },
      { ownerId: 'p', name: 'p', component: 'auth', kind: 'person' as const },
    ];
    expect(ownersOfRecord(owners, 'billing').map((o) => o.ownerId)).toEqual(['@a/b']);
    expect(ownersOfRecord(owners).length).toBe(2);
    expect(ownersOfRecord(null, 'x')).toEqual([]);
  });
});

describe('EvidenceCard provenance links', () => {
  it('renders the originating PR and issue with state, and never a non-http href', () => {
    render(
      <EvidenceCard
        id="DEC-002"
        type="DECISION"
        title="Exponential backoff"
        sourceUrl={COMMIT}
        links={[
          { kind: 'pull_request', label: 'PR #42 Revert linear backoff', url: PR },
          { kind: 'issue', label: 'Issue #1042 Retry storm', url: ISSUE, state: 'closed' },
          { kind: 'issue', label: 'bad', url: 'javascript:alert(1)' },
        ]}
      />
    );
    const prov = screen.getByTestId('evidence-provenance');
    expect(within(prov).getByTestId('evidence-link-pull_request')).toHaveAttribute('href', PR);
    expect(within(prov).getByTestId('evidence-link-issue')).toHaveAttribute('href', ISSUE);
    expect(within(prov).getByText('(closed)')).toBeInTheDocument();
    expect(within(prov).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByTestId('evidence-source-link')).toHaveAttribute('href', COMMIT);
  });

  it('drops a javascript: sourceUrl and shows no provenance block without links', () => {
    render(<EvidenceCard id="d" type="DECISION" title="t" sourceUrl="javascript:alert(1)" />);
    expect(screen.queryByTestId('evidence-source-link')).toBeNull();
    expect(screen.queryByTestId('evidence-provenance')).toBeNull();
  });

  it('supports TEAM cards without a validity badge', () => {
    render(<EvidenceCard id="@acme/payments" type="TEAM" title="payments" hideValidity />);
    expect(screen.getByText('TEAM')).toBeInTheDocument();
    expect(screen.queryByTestId('evidence-valid-badge')).toBeNull();
  });
});

describe('BriefingView surfaces provenance, reviewers and owners of record', () => {
  const response: WebBriefingResponse = {
    status: 'SUCCESS',
    briefing: {
      summary: {
        overview: 'Retry changes are governed by DEC-002.',
        riskLevel: 'high',
        keyTakeaways: [
          { claim: 'DEC-002 came from PR #42 which closed incident #1042.', citedNodeIds: ['DEC-002', 'PR-042', 'issue_1042'] },
          { claim: 'Plain claim with no PR.', citedNodeIds: ['billing'] },
        ],
      },
      blastRadius: { analysis: 'billing', affectedComponents: [] },
      keyOwners: [
        { personId: 'person-alice', name: 'Alice Nakamura', role: 'author', component: 'billing', authoredCount: 2, reviewedCount: 1, citedNodeIds: ['person-alice'] },
        { personId: 'person-bob', name: 'Bob Okafor', role: 'reviewer', component: 'billing', authoredCount: 1, reviewedCount: 3, citedNodeIds: ['person-bob'] },
      ],
      constrainingDecisions: [
        { decisionId: 'DEC-002', title: 'Exponential Backoff', component: 'billing', status: 'active', constraint: 'Use jitter', citedNodeIds: ['DEC-002'] },
      ],
      precedents: [
        { decisionId: 'DEC-002', title: 'Exponential Backoff (precedent)', relevance: 'same area', citedNodeIds: ['DEC-002'] },
      ],
    },
    evidence: { totalCitedCount: 6, verifiedCitationCount: 6 },
    sources,
    codeOwners: [
      { ownerId: '@synthetic-demo/payments', name: 'payments', component: 'billing', pattern: '/src/billing/', kind: 'team' },
      { ownerId: 'person-alice', name: 'Alice Nakamura', component: 'billing', pattern: '/src/billing/', kind: 'person' },
    ],
  };

  it('links takeaways to the PR / issue they cite', () => {
    render(<BriefingView response={response} />);
    const links = screen.getAllByTestId('takeaway-source-link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['PR #42', PR],
      ['Issue #1042', ISSUE],
    ]);
    // the claim without a PR/issue gets no chips
    expect(screen.getByText('Plain claim with no PR.').parentElement?.querySelector('a')).toBeNull();
  });

  it('shows where each decision came from on decision and precedent cards', () => {
    render(<BriefingView response={response} />);
    const cards = screen.getAllByTestId('evidence-card-DEC-002');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getByTestId('evidence-link-pull_request')).toHaveAttribute('href', PR);
      expect(within(card).getByTestId('evidence-link-issue')).toHaveAttribute('href', ISSUE);
      expect(within(card).getByTestId('evidence-source-link')).toHaveAttribute('href', COMMIT);
    }
  });

  it('shows authored / reviewed counts and flags the owner of record; lists owners of record', () => {
    render(<BriefingView response={response} />);
    const alice = screen.getByTestId('evidence-card-person-alice');
    expect(alice).toHaveTextContent('Authored: 2 PRs/commits, Reviewed: 1 PRs.');
    expect(alice).toHaveTextContent('Owner of record (CODEOWNERS)');
    const bob = screen.getByTestId('evidence-card-person-bob');
    expect(bob).toHaveTextContent('Reviewed: 3 PRs.');
    expect(bob).not.toHaveTextContent('Owner of record (CODEOWNERS)');
    // the people cards have no "valid in force" badge
    expect(within(alice).queryByTestId('evidence-valid-badge')).toBeNull();

    // owners of record without their own card are listed; Alice (already shown above) is not repeated
    const block = screen.getByTestId('owners-of-record');
    expect(within(block).getByTestId('evidence-card-@synthetic-demo/payments')).toHaveTextContent('TEAM');
    expect(block).toHaveTextContent('Owns billing per CODEOWNERS (/src/billing/).');
    expect(within(block).queryByTestId('evidence-card-person-alice')).toBeNull();
    expect(screen.getAllByTestId('evidence-card-person-alice')).toHaveLength(1);
  });

  it('degrades gracefully for briefings without sources / owners (older server, showcase graph)', () => {
    const { sources: _s, codeOwners: _c, ...bare } = response;
    render(<BriefingView response={bare as WebBriefingResponse} />);
    expect(screen.queryByTestId('takeaway-source-link')).toBeNull();
    expect(screen.queryByTestId('owners-of-record')).toBeNull();
    expect(screen.queryByTestId('evidence-provenance')).toBeNull();
    expect(screen.getAllByTestId('evidence-card-DEC-002')).toHaveLength(2);
  });
});

describe('ingest client: re-sync', () => {
  afterEach(() => vi.restoreAllMocks());
  const statusRes = (jobId: string, status: string, extra: Record<string, unknown> = {}) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ workspaceId: 'ws', jobId, status, progress: 0, error: null, nodeCount: 7, ...extra }),
  });

  it('startRefresh POSTs to the workspace refresh endpoint with the bearer token', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, json: () => Promise.resolve({ workspaceId: 'a b', jobId: 'job_2', repositoryFullName: 'o/r' }) });
    const started = await startRefresh('a b', 'tok');
    expect(started.jobId).toBe('job_2');
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/workspaces/a%20b/refresh', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer tok' } }));
  });

  it('startRefresh surfaces the server message (403 / 409 / 429)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ error: 'Only the workspace owner can re-sync it' }) });
    await expect(startRefresh('ws', null)).rejects.toThrow('Only the workspace owner can re-sync it');
  });

  it('REGRESSION: waits for the NEW job; the previous completed job must not end the wait', async () => {
    const seq = [
      statusRes('job_old', 'completed'), // right after POST: still the previous job
      statusRes('job_old', 'completed'),
      statusRes('job_new', 'mining'),
      statusRes('job_new', 'completed', { nodeCount: 11 }),
    ];
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(seq.shift()));
    const seen: string[] = [];
    const final = await waitForIngest('ws', { getToken: async () => null, intervalMs: 1, jobId: 'job_new', onProgress: (s) => seen.push(`${s.jobId}:${s.status}`) });
    expect(final.nodeCount).toBe(11);
    expect(seen).toEqual(['job_new:mining', 'job_new:completed']); // the old job was never reported
  });

  it('a failure of the awaited job is reported, but a failure of the previous job is ignored', async () => {
    const seq = [statusRes('job_old', 'failed', { error: 'old problem' }), statusRes('job_new', 'failed', { error: 'clone failed' })];
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(seq.shift()));
    await expect(waitForIngest('ws', { getToken: async () => null, intervalMs: 1, jobId: 'job_new' })).rejects.toThrow('clone failed');
  });

  it('gives up with a clear error when the new job never shows up', async () => {
    global.fetch = vi.fn().mockResolvedValue(statusRes('job_old', 'completed'));
    await expect(
      waitForIngest('ws', { getToken: async () => null, intervalMs: 1, jobId: 'job_new', startTimeoutMs: 20 })
    ).rejects.toBeInstanceOf(IngestNotStartedError);
  });

  it('without a jobId nothing changes (initial ingest keeps following the latest job)', async () => {
    global.fetch = vi.fn().mockResolvedValue(statusRes('job_any', 'completed'));
    await expect(waitForIngest('ws', { getToken: async () => null, intervalMs: 1 })).resolves.toMatchObject({ status: 'completed' });
  });
});

describe('WorkspaceSwitcher: Re-sync action', () => {
  const owner = 'user-1';
  const workspace = { id: 'pub-acme-widgets-abc123', name: 'acme/widgets', repoUrl: 'https://github.com/acme/widgets' };

  beforeEach(() => {
    window.localStorage.setItem(storageKeyForOwner(owner), JSON.stringify([workspace]));
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  const open = () => {
    const onResyncComplete = vi.fn();
    render(
      <WorkspaceSwitcher
        ownerId={owner}
        currentWorkspaceId={workspace.id}
        onSelectWorkspace={vi.fn()}
        onResyncComplete={onResyncComplete}
      />
    );
    fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
    return { onResyncComplete };
  };

  it('is offered for ingested workspaces only (not for the static showcase graphs)', async () => {
    open();
    await screen.findByTestId(`workspace-resync-${workspace.id}`);
    expect(screen.queryByTestId('workspace-resync-ember-adr-showcase')).toBeNull();
    expect(screen.queryByTestId('workspace-resync-synthetic-demo')).toBeNull();
  });

  it('starts a refresh, follows the new job, reports success and asks the page to reload', async () => {
    const calls: string[] = [];
    const statuses = [
      { workspaceId: workspace.id, jobId: 'job_old', status: 'completed', progress: 1, error: null, nodeCount: 5 },
      { workspaceId: workspace.id, jobId: 'job_new', status: 'completed', progress: 1, error: null, nodeCount: 9 },
    ];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/refresh')) {
        return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({ workspaceId: workspace.id, jobId: 'job_new', repositoryFullName: 'acme/widgets' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(statuses.shift()) });
    });

    const { onResyncComplete } = open();
    fireEvent.click(await screen.findByTestId(`workspace-resync-${workspace.id}`));
    expect(await screen.findByText(/re-syncing/)).toBeInTheDocument();

    await waitFor(() => expect(onResyncComplete).toHaveBeenCalledWith(workspace.id), { timeout: 8000 });
    expect(await screen.findByText(/re-synced/)).toBeInTheDocument();
    expect(calls[0]).toBe(`POST /api/v1/workspaces/${workspace.id}/refresh`);
    expect(calls.slice(1).every((c) => c.startsWith('GET ') && c.endsWith('/ingest-status'))).toBe(true);
  }, 15000);

  it('shows the server\'s reason when the re-sync is refused, and does not reload', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'An ingestion is already running for this workspace' }) });
    const { onResyncComplete } = open();
    fireEvent.click(await screen.findByTestId(`workspace-resync-${workspace.id}`));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An ingestion is already running for this workspace');
    expect(onResyncComplete).not.toHaveBeenCalled();
    // can try again
    expect(screen.getByTestId(`workspace-resync-${workspace.id}`)).not.toBeDisabled();
  });
});
