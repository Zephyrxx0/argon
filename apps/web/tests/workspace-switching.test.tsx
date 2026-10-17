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

const fileGraphFor = (ws: string) => ({
  workspaceId: ws,
  elements: {
    nodes: [
      { data: { id: `${ws}/a.ts`, label: `${ws}/a.ts`, type: 'File', properties: { path: `${ws}/a.ts`, component: 'src', touches: 4 } } },
      { data: { id: `${ws}/b.ts`, label: `${ws}/b.ts`, type: 'File', properties: { path: `${ws}/b.ts`, component: 'src', touches: 3 } } },
    ],
    edges: [
      { data: { id: 'co:1', source: `${ws}/a.ts`, target: `${ws}/b.ts`, label: 'CO_CHANGES', properties: { weight: 0.5, count: 6 } } },
    ],
  },
  stats: { files: 2, totalFiles: 9, edges: 1, totalEdges: 1, truncated: false },
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
      if (m[2] === 'overview' && u.includes('view=files')) return json(fileGraphFor(ws));
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

  it('toggles the canvas to the workspace\'s file co-change graph and back, resetting on workspace switch', async () => {
    installFetch();
    renderPage();
    expect((await screen.findAllByText('comp-ember-adr-showcase')).length).toBeGreaterThan(0);

    // the Files graph is only requested once selected
    const urls = () => (global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls().some((u: string) => u.includes('view=files'))).toBe(false);

    fireEvent.click(visible('hud-view-files'));
    expect((await screen.findAllByText('a.ts')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('comp-ember-adr-showcase')).toHaveLength(0);
    expect(visible('hud-view-files')).toHaveAttribute('aria-pressed', 'true');
    expect(urls().some((u: string) => u.includes('/ember-adr-showcase/overview?view=files'))).toBe(true);
    expect(visible('graph-legend-note').textContent).toMatch(/2\/9 files, 1\/1 links/);

    fireEvent.click(visible('hud-view-overview'));
    expect((await screen.findAllByText('comp-ember-adr-showcase')).length).toBeGreaterThan(0);

    // a workspace switch always lands on that workspace's overview
    fireEvent.click(visible('hud-view-files'));
    await screen.findAllByText('a.ts');
    await switchTo('synthetic-demo');
    expect((await screen.findAllByText('comp-synthetic-demo')).length).toBeGreaterThan(0);
    expect(visible('hud-view-overview')).toHaveAttribute('aria-pressed', 'true');
  });

  it('returns from a briefing to the original state (hub + overview graph with the view toggle)', async () => {
    installFetch();
    renderPage();
    expect((await screen.findAllByText('comp-ember-adr-showcase')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('briefing-back-btn')).not.toBeInTheDocument();

    await runScenario();
    expect(await screen.findByTestId('briefing-back-btn')).toBeInTheDocument();
    // a briefing replaces the canvas graph, so there is no view toggle meanwhile
    await waitFor(() => expect(screen.queryAllByTestId('hud-view-toggle')).toHaveLength(0));

    fireEvent.click(screen.getByTestId('briefing-back-btn'));
    await waitFor(() => expect(screen.queryByTestId('briefing-back-btn')).not.toBeInTheDocument());
    expect(screen.queryByTestId('briefing-view')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('scenario-card-s1-blast-radius').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('comp-ember-adr-showcase')).length).toBeGreaterThan(0);
    expect(visible('hud-view-overview')).toHaveAttribute('aria-pressed', 'true');
  });

  it('cancels a briefing that is still running when going back', async () => {
    installFetch({ deferBriefing: true });
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');
    await runScenario();
    const back = await screen.findByTestId('briefing-back-btn');
    await waitFor(() => expect(pendingBriefings).toHaveLength(1));

    fireEvent.click(back);
    expect(pendingBriefings[0]!.signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('briefing-back-btn')).not.toBeInTheDocument());
    expect(screen.queryByTestId('briefing-loading-skeleton')).not.toBeInTheDocument();
  });

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

  it('a finished re-sync reloads the workspace\'s graph and contributors (same workspace id)', async () => {
    const wsId = 'pub-acme-widgets-abc123';
    window.localStorage.setItem(
      'argon.workspaces.custom.guest',
      JSON.stringify([{ id: wsId, name: 'acme/widgets', repoUrl: 'https://github.com/acme/widgets' }])
    );
    installFetch();
    const base = (global.fetch as any).getMockImplementation() as (u: string, i?: RequestInit) => Promise<unknown>;
    global.fetch = vi.fn().mockImplementation((u: string, init?: RequestInit) => {
      const url = String(u);
      if (url.endsWith('/refresh')) return json({ workspaceId: wsId, jobId: 'job_new', repositoryFullName: 'acme/widgets' }, 202);
      if (url.endsWith('/ingest-status'))
        return json({ workspaceId: wsId, jobId: 'job_new', status: 'completed', progress: 1, error: null, nodeCount: 3 });
      return base(url, init);
    }) as any;

    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');
    await switchTo(wsId);
    await screen.findAllByText(`comp-${wsId}`);

    const count = (suffix: string) =>
      (global.fetch as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes(`/api/workspace/${wsId}/${suffix}`)).length;
    const overviewBefore = count('overview');
    const contributorsBefore = count('contributors');
    expect(overviewBefore).toBeGreaterThan(0);

    fireEvent.click(visible('workspace-switcher-trigger'));
    fireEvent.click(await screen.findByTestId(`workspace-resync-${wsId}`));

    await waitFor(() => expect(count('overview')).toBeGreaterThan(overviewBefore), { timeout: 8000 });
    await waitFor(() => expect(count('contributors')).toBeGreaterThan(contributorsBefore), { timeout: 8000 });
    const refreshCalls = (global.fetch as any).mock.calls.filter((c: unknown[]) => String(c[0]).endsWith('/refresh'));
    expect(refreshCalls).toHaveLength(1);
  }, 20000);
});
