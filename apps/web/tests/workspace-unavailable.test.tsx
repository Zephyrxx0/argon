import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkspacePage from '@/app/workspace/page';
import { AuthProvider } from '@/app/providers';
import { WorkspaceUnavailable } from '@/components/workspace/workspace-unavailable';
import { WorkspaceSwitcher, SHOWCASE_WORKSPACES, REMOVE_WORKSPACE_EVENT } from '@/components/workspace/workspace-switcher';
import { saveCustomWorkspaces, loadCustomWorkspaces, rememberGuestForLinking } from '@/lib/custom-workspaces';

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const GONE = 'pub-acme-widgets-abc123';
const FORBIDDEN = 'pub-acme-secret-def456';

function installFetch() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const m = /\/api\/workspace\/([^/?]+)\/(overview|contributors|files|supersessions)/.exec(String(url));
    if (!m) return json({}, 404);
    const ws = decodeURIComponent(m[1]!);
    if (ws === GONE) return json({ error: 'NOT_FOUND', message: `Workspace '${ws}' not found` }, 404);
    if (ws === FORBIDDEN) return json({ error: 'FORBIDDEN', message: 'Workspace access denied' }, 403);
    if (m[2] === 'overview')
      return json({
        workspaceId: ws,
        elements: { nodes: [{ data: { id: `comp-${ws}`, label: `comp-${ws}`, type: 'Component', properties: {} } }], edges: [] },
        stats: { components: 1, files: 1, decisions: 0, people: 0, truncated: false },
      });
    if (m[2] === 'contributors') return json({ workspaceId: ws, contributors: [] });
    return json({ workspaceId: ws, files: [], supersessions: [], truncated: false });
  }) as any;
}

const visible = (id: string) => screen.getAllByTestId(id)[0]!;

describe('WorkspaceUnavailable (component)', () => {
  const props = { workspaceId: 'pub-x-111111', removable: true, onOpenShowcase: vi.fn(), onRemove: vi.fn() };

  it('404: says the workspace does not exist on this server and offers both ways out', () => {
    const onOpenShowcase = vi.fn();
    const onRemove = vi.fn();
    render(<WorkspaceUnavailable {...props} status={404} onOpenShowcase={onOpenShowcase} onRemove={onRemove} />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-status', '404');
    expect(screen.getByTestId('workspace-unavailable-message')).toHaveTextContent('pub-x-111111 does not exist on this server');
    fireEvent.click(screen.getByTestId('workspace-unavailable-showcase'));
    fireEvent.click(screen.getByTestId('workspace-unavailable-remove'));
    expect(onOpenShowcase).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('403: says whose it is and does not claim it is gone', () => {
    render(<WorkspaceUnavailable {...props} status={403} />);
    expect(screen.getByTestId('workspace-unavailable-message')).toHaveTextContent('You do not have access to pub-x-111111');
    expect(screen.getByTestId('workspace-unavailable-message')).not.toHaveTextContent('does not exist');
  });

  it('a built-in showcase workspace cannot be removed', () => {
    render(<WorkspaceUnavailable {...props} status={404} removable={false} />);
    expect(screen.queryByTestId('workspace-unavailable-remove')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-unavailable-showcase')).toBeInTheDocument();
  });
});

describe('Workspace that no longer exists (page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    saveCustomWorkspaces(null, [
      { id: GONE, name: 'acme/widgets' },
      { id: FORBIDDEN, name: 'acme/secret' },
    ]);
    installFetch();
  });

  const renderPage = () =>
    render(
      <AuthProvider>
        <WorkspacePage />
      </AuthProvider>
    );

  const open = async (id: string) => {
    await screen.findAllByText('comp-ember-adr-showcase');
    fireEvent.click(visible('workspace-switcher-trigger'));
    fireEvent.click((await screen.findAllByTestId(`workspace-item-${id}`))[0]!);
  };

  it('shows a clear "not found" with a way out instead of a dead end, and removing it forgets the entry and returns to the showcase', async () => {
    renderPage();
    await open(GONE);

    const banner = await screen.findByTestId('workspace-unavailable');
    expect(banner).toHaveAttribute('data-status', '404');
    expect(screen.getByTestId('workspace-unavailable-message')).toHaveTextContent(GONE);

    fireEvent.click(screen.getByTestId('workspace-unavailable-remove'));
    await waitFor(() => expect(screen.queryByTestId('workspace-unavailable')).not.toBeInTheDocument());
    expect(loadCustomWorkspaces(null).map((w) => w.id)).toEqual([FORBIDDEN]); // forgotten, the other one stays
    expect((await screen.findAllByText('comp-ember-adr-showcase')).length).toBeGreaterThan(0);
  });

  it('"Open the showcase" leaves the workspace but keeps it in the list', async () => {
    renderPage();
    await open(GONE);
    fireEvent.click(await screen.findByTestId('workspace-unavailable-showcase'));
    await waitFor(() => expect(screen.queryByTestId('workspace-unavailable')).not.toBeInTheDocument());
    expect(loadCustomWorkspaces(null).map((w) => w.id)).toContain(GONE);
  });

  it('a workspace the account cannot access says so (403)', async () => {
    renderPage();
    await open(FORBIDDEN);
    expect(await screen.findByTestId('workspace-unavailable')).toHaveAttribute('data-status', '403');
  });

  it('a workspace that opens fine shows no banner', async () => {
    renderPage();
    await screen.findAllByText('comp-ember-adr-showcase');
    expect(screen.queryByTestId('workspace-unavailable')).not.toBeInTheDocument();
  });
});

describe('WorkspaceSwitcher: list handling', () => {
  beforeEach(() => window.localStorage.clear());

  it('lists the seeded Argon Dogfood showcase and no longer the unseeded Astro one', () => {
    const ids = SHOWCASE_WORKSPACES.map((w) => w.id);
    expect(ids).toContain('argon-dogfood');
    expect(ids).not.toContain('astro-rfc-showcase');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adopts the linked guest\'s workspaces when the account signs in', async () => {
    saveCustomWorkspaces('guest-1', [{ id: 'pub-a-111111', name: 'a/a' }]);
    rememberGuestForLinking('guest-1');
    render(<WorkspaceSwitcher ownerId="user-1" authenticated onSelectWorkspace={vi.fn()} />);
    fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
    expect(await screen.findByTestId('workspace-item-pub-a-111111')).toBeInTheDocument();
    expect(loadCustomWorkspaces('user-1').map((w) => w.id)).toEqual(['pub-a-111111']);
    expect(loadCustomWorkspaces('guest-1')).toEqual([]);
  });

  it('does not adopt while still a guest', () => {
    saveCustomWorkspaces('guest-1', [{ id: 'pub-a-111111', name: 'a/a' }]);
    rememberGuestForLinking('guest-1');
    render(<WorkspaceSwitcher ownerId="guest-2" authenticated={false} onSelectWorkspace={vi.fn()} />);
    expect(loadCustomWorkspaces('guest-1')).toHaveLength(1);
  });

  it('the remove event forgets a workspace and leaves it if it is the open one', async () => {
    saveCustomWorkspaces('user-1', [{ id: 'pub-a-111111', name: 'a/a' }]);
    const onSelect = vi.fn();
    render(<WorkspaceSwitcher ownerId="user-1" authenticated currentWorkspaceId="pub-a-111111" onSelectWorkspace={onSelect} />);
    window.dispatchEvent(new CustomEvent(REMOVE_WORKSPACE_EVENT, { detail: { workspaceId: 'pub-a-111111' } }));
    await waitFor(() => expect(loadCustomWorkspaces('user-1')).toEqual([]));
    expect(onSelect).toHaveBeenCalledWith('ember-adr-showcase');
  });
});
