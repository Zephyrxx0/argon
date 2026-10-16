import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContributorPicker, type Contributor } from '@/components/contributor/contributor-picker';
import { NodeInspector, type InspectedNode } from '@/components/canvas/node-inspector';
import * as authClientModule from '@/lib/auth-client';
import { AuthProvider } from '@/app/providers';

vi.mock('@/lib/auth-client', () => {
  return {
    authClient: {
      signIn: {
        anonymous: vi.fn().mockResolvedValue({ user: { isAnonymous: true } }),
        social: vi.fn().mockResolvedValue({}),
      },
      signOut: vi.fn().mockResolvedValue({}),
      token: vi.fn().mockResolvedValue({ data: { token: 'mock.bearer.token' } }),
    },
    useSession: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
});

describe('Contributor Identity Attribution & [YOU] Badges (Task 07-03-02, TENANT-02, D-16)', () => {
  const mockContributors: Contributor[] = [
    {
      id: 'c-alice',
      name: 'Alice Developer',
      role: 'Lead Architect',
      commits: 120,
      lastActive: '1d ago',
      login: 'alicedev',
      userId: 'u_alice_123',
      avatarUrl: 'https://github.com/alicedev.png',
    },
    {
      id: 'c-bob',
      name: 'Bob Engineer',
      role: 'Core Contributor',
      commits: 85,
      lastActive: '3d ago',
      login: 'bobdev',
      userId: 'u_bob_456',
      avatarUrl: 'https://github.com/bobdev.png',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ContributorPicker', () => {
    it('renders [YOU] badge on matching contributor in dropdown for authenticated user', () => {
      (authClientModule.useSession as any).mockReturnValue({
        data: {
          session: { id: 's_authed' },
          user: { id: 'u_alice_123', name: 'Alice Developer', login: 'alicedev', isAnonymous: false },
        },
        isPending: false,
      });

      render(
        <AuthProvider>
          <ContributorPicker
            contributors={mockContributors}
            currentContributorId={null}
            onSelectContributor={vi.fn()}
          />
        </AuthProvider>
      );

      // Open dropdown
      const trigger = screen.getByTestId('contributor-picker-trigger');
      fireEvent.click(trigger);

      // Verify dropdown is open
      expect(screen.getByTestId('contributor-dropdown')).toBeInTheDocument();

      // Alice should have the [YOU] badge
      const youBadge = screen.getByTestId('contributor-you-badge');
      expect(youBadge).toBeInTheDocument();
      expect(youBadge).toHaveTextContent('YOU');

      // Only one [YOU] badge should be rendered
      const allYouBadges = screen.getAllByTestId('contributor-you-badge');
      expect(allYouBadges).toHaveLength(1);
    });

    it('renders [YOU] on the trigger pill when matching contributor is selected', () => {
      (authClientModule.useSession as any).mockReturnValue({
        data: {
          session: { id: 's_authed' },
          user: { id: 'u_alice_123', name: 'Alice Developer', login: 'alicedev', isAnonymous: false },
        },
        isPending: false,
      });

      render(
        <AuthProvider>
          <ContributorPicker
            contributors={mockContributors}
            currentContributorId="c-alice"
            onSelectContributor={vi.fn()}
          />
        </AuthProvider>
      );

      const triggerBadge = screen.getByTestId('contributor-trigger-you-badge');
      expect(triggerBadge).toBeInTheDocument();
      expect(triggerBadge).toHaveTextContent('YOU');
    });

    it('never renders [YOU] badge for anonymous guest visitors (T-07-07)', () => {
      (authClientModule.useSession as any).mockReturnValue({
        data: {
          session: { id: 's_guest' },
          user: { id: 'u_guest', name: 'Anonymous', isAnonymous: true },
        },
        isPending: false,
      });

      render(
        <AuthProvider>
          <ContributorPicker
            contributors={mockContributors}
            currentContributorId="c-alice"
            onSelectContributor={vi.fn()}
          />
        </AuthProvider>
      );

      // Trigger should not have YOU badge
      expect(screen.queryByTestId('contributor-trigger-you-badge')).not.toBeInTheDocument();

      // Open dropdown
      fireEvent.click(screen.getByTestId('contributor-picker-trigger'));
      expect(screen.queryByTestId('contributor-you-badge')).not.toBeInTheDocument();
    });
  });

  describe('NodeInspector', () => {
    it('renders verified GitHub badge, avatar, and [YOU] indicator on matching Person node', () => {
      (authClientModule.useSession as any).mockReturnValue({
        data: {
          session: { id: 's_authed' },
          user: { id: 'u_alice_123', name: 'Alice Developer', login: 'alicedev', isAnonymous: false },
        },
        isPending: false,
      });

      const personNode: InspectedNode = {
        id: 'node_p_alice',
        label: 'Alice Developer',
        type: 'Person',
        properties: {
          github_login: 'alicedev',
          user_id: 'u_alice_123',
          avatar_url: 'https://github.com/alicedev.png',
          commits: 120,
        },
      };

      render(
        <AuthProvider>
          <NodeInspector node={personNode} onClose={vi.fn()} />
        </AuthProvider>
      );

      expect(screen.getByTestId('verified-github-badge')).toHaveTextContent('Verified GitHub Profile');
      expect(screen.getByTestId('node-inspector-you-badge')).toHaveTextContent('YOU');

      const profileLink = screen.getByTestId('github-profile-link');
      expect(profileLink).toHaveAttribute('href', 'https://github.com/alicedev');
      expect(profileLink).toHaveTextContent('@alicedev');
    });

    it('renders verified badge and link without [YOU] when Person node is another developer', () => {
      (authClientModule.useSession as any).mockReturnValue({
        data: {
          session: { id: 's_authed' },
          user: { id: 'u_alice_123', name: 'Alice Developer', login: 'alicedev', isAnonymous: false },
        },
        isPending: false,
      });

      const bobNode: InspectedNode = {
        id: 'node_p_bob',
        label: 'Bob Engineer',
        type: 'Person',
        properties: {
          github_login: 'bobdev',
          user_id: 'u_bob_456',
          avatar_url: 'https://github.com/bobdev.png',
          commits: 85,
        },
      };

      render(
        <AuthProvider>
          <NodeInspector node={bobNode} onClose={vi.fn()} />
        </AuthProvider>
      );

      expect(screen.getByTestId('verified-github-badge')).toHaveTextContent('Verified GitHub Profile');
      expect(screen.queryByTestId('node-inspector-you-badge')).not.toBeInTheDocument();

      const profileLink = screen.getByTestId('github-profile-link');
      expect(profileLink).toHaveAttribute('href', 'https://github.com/bobdev');
    });

    it('renders unlinked git author nodes without verified badge or YOU indicator', () => {
      (authClientModule.useSession as any).mockReturnValue({
        data: {
          session: { id: 's_authed' },
          user: { id: 'u_alice_123', name: 'Alice Developer', login: 'alicedev', isAnonymous: false },
        },
        isPending: false,
      });

      const unlinkedNode: InspectedNode = {
        id: 'node_p_anon',
        label: 'Historic Committer',
        type: 'Person',
        properties: {
          email_hash: 'abc123hash',
          commits: 12,
        },
      };

      render(
        <AuthProvider>
          <NodeInspector node={unlinkedNode} onClose={vi.fn()} />
        </AuthProvider>
      );

      expect(screen.queryByTestId('verified-github-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-inspector-you-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('github-profile-link')).not.toBeInTheDocument();
      expect(screen.getByText('Historic Committer')).toBeInTheDocument();
    });
  });
});
