import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContributorPicker } from '@/components/contributor/contributor-picker';
import * as providers from '@/app/providers';

const people = (names: string[]) => ({
  workspaceId: 'ws',
  contributors: names.map((n) => ({ id: n.toLowerCase(), name: n, commits: 1, reviews: 0, role: 'Author', lastActiveAt: null })),
});

const mockAuth = (user: unknown) =>
  vi.spyOn(providers, 'useAuth').mockReturnValue({
    user,
    isAnonymous: !user,
    getToken: async () => 'tok',
  } as any);

describe('ContributorPicker default identity (#4)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('auto-selects the signed-in user when they appear in the workspace', async () => {
    mockAuth({ id: 'u1', name: 'Zephyrxx0', isAnonymous: false });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(people(['Zephyrxx0', 'Alice'])) });
    const onSelect = vi.fn();
    render(<ContributorPicker workspaceId="ws" currentContributorId={null} onSelectContributor={onSelect} />);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('zephyrxx0'));
  });

  it('falls back to Guest when the user is not a contributor here', async () => {
    mockAuth({ id: 'u1', name: 'Zephyrxx0', isAnonymous: false });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(people(['Alice', 'Bob'])) });
    const onSelect = vi.fn();
    render(<ContributorPicker workspaceId="ws" currentContributorId={null} onSelectContributor={onSelect} />);
    await waitFor(() => expect(screen.getByTestId('contributor-picker-trigger')).toHaveTextContent('Guest'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not auto-select for a guest visitor', async () => {
    mockAuth(null);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(people(['Alice'])) });
    const onSelect = vi.fn();
    render(<ContributorPicker workspaceId="ws" currentContributorId={null} onSelectContributor={onSelect} />);
    await screen.findByText(/Alice|Guest/);
    await new Promise((r) => setTimeout(r, 50));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('never overrides an explicit selection', async () => {
    mockAuth({ id: 'u1', name: 'Zephyrxx0', isAnonymous: false });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(people(['Zephyrxx0'])) });
    const onSelect = vi.fn();
    render(<ContributorPicker workspaceId="ws" currentContributorId="alice" onSelectContributor={onSelect} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
