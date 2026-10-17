import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkspacePage from '@/app/workspace/page';
import { AuthProvider } from '@/app/providers';

type Resolve = (r: unknown) => void;

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const overviewFor = (ws: string) => ({
  workspaceId: ws,
  elements: {
    nodes: [{ data: { id: `comp-${ws}`, label: `comp-${ws}`, type: 'Component', properties: { reason: '3 files' } } }],
    edges: [],
  },
  stats: { components: 1, files: 3, decisions: 0, people: 1, truncated: false },
});

const contributorsFor = (ws: string) => ({
  workspaceId: ws,
  contributors: [
    { id: `person-${ws}`, name: `Person of ${ws}`, commits: 7, reviews: 0, role: 'Top Contributor', lastActiveAt: null },
  ],
});

const briefingFor = (ws: string) => ({
  status: 'SUCCESS',
  briefingId: `b-${ws}`,
  briefing: {
    summary: { overview: `Briefing for ${ws}`, riskLevel: 'low', keyTakeaways: [{ claim: 'c', citedNodeIds: [`comp-${ws}`] }] },
    blastRadius: {
      analysis: 'a',
      affectedComponents: [{ component: `comp-${ws}`, reason: 'r', citedNodeIds: [`comp-${ws}`] }],
    },
    keyOwners: [],
    constrainingDecisions: [],
    precedents: [],
  },
  evidence: { totalCitedCount: 2, verifiedCitationCount: 2 },
});

let pendingBriefings: Array<{ workspaceId: string; resolve: Resolve; signal?: AbortSignal | null }> = [];

function installFetch(opts: { deferBriefing?: boolean } = {}) {
  pendingBriefings = [];
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const m = /\/api\/workspace\/([^/]+)\/(overview|contributors|files|supersessions)/.exec(u);
    if (m) {
      const ws = decodeURIComponent(m[1]!);
      if (m[2] === 'overview') return json(overviewFor(ws));
      if (m[2] === 'contributors') return json(contributorsFor(ws));
      if (m[2] === 'files') return json({ workspaceId: ws, files: [], truncated: false });
      return json({ workspaceId: ws, supersessions: [] });
    }
    if (u.includes('/api/briefing')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (opts.deferBriefing) {
        return new Promise((resolve) => {
          pendingBriefings.push({
            workspaceId: body.workspaceId,
            signal: init?.signal,
            resolve: (r) => resolve(r),
          });
        });
      }
      return json(briefingFor(body.workspaceId));
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  }) as any;
}

const visible = (testId: string) => screen.getAllByTestId(testId)[0]!;

async function switchTo(workspaceId: string) {
  fireEvent.click(visible('workspace-switcher-trigger'));
  fireEvent.click((await screen.findAllByTestId(`workspace-item-${workspaceId}`))[0]!);
}

async function runScenario() {
  fireEvent.click(visible('scenario-card-s1-blast-radius'));
}

describe('Workspace switching keeps graph, briefing and contributors scoped to the workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const renderPage = () =>
    render(
      <AuthProvider>
        <WorkspacePage />
      </AuthProvider>
    );

  it('draws the selected workspace\'s own overview graph (not a hard-coded sample) and follows switches', async () => {
    installFetch();
    renderPage();

    expect((await screen.findAllByText('comp-ember-adr-showcase')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('BillingEngine')).toHaveLength(0);

    await switchTo('synthetic-demo');

    expect((await screen.findAllByText('comp-synthetic-demo')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryAllByText('comp-ember-adr-showcase')).toHaveLength(0));
    expect(
      (global.fetch as any).mock.calls.some(([u]: [string]) => String(u).includes('/api/workspace/synthetic-demo/overview'))
    ).toBe(true);
  });

  it('lists only the active workspace\'s contributors and resets the selected identity on switch', async () => {
    installFetch();
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');

    fireEvent.click(visible('contributor-picker-trigger'));
    fireEvent.click((await screen.findAllByTestId('contributor-item-person-ember-adr-showcase'))[0]!);
    expect(visible('contributor-picker-trigger')).toHaveTextContent('Person of ember-adr-showcase');

    await switchTo('synthetic-demo');

    // identity from the previous workspace is gone
    await waitFor(() => expect(visible('contributor-picker-trigger')).toHaveTextContent('Guest'));
    fireEvent.click(visible('contributor-picker-trigger'));
    expect((await screen.findAllByTestId('contributor-item-person-synthetic-demo')).length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('contributor-item-person-ember-adr-showcase')).toHaveLength(0);
  });

  it('shows the contributor empty state for a workspace without people', async () => {
    installFetch();
    const base = global.fetch as any;
    global.fetch = vi.fn().mockImplementation((u: string, init?: RequestInit) =>
      String(u).includes('/contributors') ? json({ workspaceId: 'x', contributors: [] }) : base(u, init)
    ) as any;
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');
    fireEvent.click(visible('contributor-picker-trigger'));
    expect((await screen.findAllByTestId('contributor-empty'))[0]).toHaveTextContent('No contributors were indexed');
  });

  it('drops the previous workspace\'s briefing when switching', async () => {
    installFetch();
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');

    await runScenario();
    expect((await screen.findAllByText('Briefing for ember-adr-showcase')).length).toBeGreaterThan(0);

    await switchTo('synthetic-demo');

    await waitFor(() => expect(screen.queryAllByText('Briefing for ember-adr-showcase')).toHaveLength(0));
    // back to the empty state for the new workspace
    expect(screen.getAllByText('No Architectural Briefing Generated').length).toBeGreaterThan(0);
  });

  it('ignores a briefing that finishes after the user already switched workspace', async () => {
    installFetch({ deferBriefing: true });
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');

    await runScenario();
    await waitFor(() => expect(pendingBriefings).toHaveLength(1));
    const stale = pendingBriefings[0]!;

    await switchTo('synthetic-demo');
    await screen.findAllByText('comp-synthetic-demo');

    // the old request is cancelled client-side...
    expect(stale.signal?.aborted).toBe(true);
    // ...and even if its response still arrives, it must not appear or leave the UI "loading"
    await act(async () => {
      stale.resolve({ ok: true, status: 200, json: () => Promise.resolve(briefingFor('ember-adr-showcase')) });
    });
    expect(screen.queryAllByText('Briefing for ember-adr-showcase')).toHaveLength(0);
    expect(screen.getAllByText('No Architectural Briefing Generated').length).toBeGreaterThan(0);
  });

  it('shows a briefing for the new workspace after a switch (and uses that workspace id)', async () => {
    installFetch();
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');

    await switchTo('synthetic-demo');
    await screen.findAllByText('comp-synthetic-demo');
    await runScenario();

    expect((await screen.findAllByText('Briefing for synthetic-demo')).length).toBeGreaterThan(0);
    const post = (global.fetch as any).mock.calls.find(([u]: [string]) => String(u).includes('/api/briefing'));
    expect(JSON.parse(post[1].body).workspaceId).toBe('synthetic-demo');
  });
});
