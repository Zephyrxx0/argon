import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestModal } from '@/components/workspace/ingest-modal';
import type { GitHubRepositoryItem } from '@/components/workspace/repo-picker';
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

describe('IngestModal & RepoPicker Integration (Task 07-03-01, ING-04)', () => {
  const mockRepos: GitHubRepositoryItem[] = [
    {
      id: 101,
      name: 'argon-private-core',
      fullName: 'argon-org/argon-private-core',
      private: true,
      defaultBranch: 'main',
      owner: { login: 'argon-org', avatarUrl: 'https://github.com/argon.png' },
      description: 'Core private backend repository',
      htmlUrl: 'https://github.com/argon-org/argon-private-core',
      installationId: 1001,
    },
    {
      id: 102,
      name: 'acme-web-client',
      fullName: 'acme-inc/acme-web-client',
      private: false,
      defaultBranch: 'master',
      owner: { login: 'acme-inc', avatarUrl: 'https://github.com/acme.png' },
      description: 'Web frontend client',
      htmlUrl: 'https://github.com/acme-inc/acme-web-client',
      installationId: 1002,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Radix tabs for "Your Repositories" and "Public Git URL"', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_authed' },
        user: { id: 'u_alice', name: 'Alice', isAnonymous: false },
      },
      isPending: false,
    });

    render(
      <AuthProvider>
        <IngestModal
          open={true}
          onOpenChange={vi.fn()}
          onIngestComplete={vi.fn()}
          initialRepositories={mockRepos}
        />
      </AuthProvider>
    );

    expect(screen.getByTestId('tab-your-repositories')).toBeInTheDocument();
    expect(screen.getByTestId('tab-public-git-url')).toBeInTheDocument();
    expect(screen.getByText('ARGON // REPOSITORY INGESTION')).toBeInTheDocument();
  });

  it('displays contextual guest empty state when viewed by an anonymous visitor', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_guest' },
        user: { id: 'u_guest', name: 'Anonymous', isAnonymous: true },
      },
      isPending: false,
    });

    const onOpenAuthSpy = vi.fn();

    render(
      <AuthProvider>
        <IngestModal
          open={true}
          onOpenChange={vi.fn()}
          onIngestComplete={vi.fn()}
          onOpenAuth={onOpenAuthSpy}
        />
      </AuthProvider>
    );

    expect(screen.getByTestId('repo-picker-guest')).toBeInTheDocument();
    expect(screen.getByText('Sign In to Access Private Repositories')).toBeInTheDocument();

    const authBtn = screen.getByTestId('repo-picker-guest-auth-btn');
    fireEvent.click(authBtn);
    expect(onOpenAuthSpy).toHaveBeenCalledTimes(1);
  });

  it('renders repository list with metadata and filters by search query and org pill', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_authed' },
        user: { id: 'u_alice', name: 'Alice', isAnonymous: false },
      },
      isPending: false,
    });

    render(
      <AuthProvider>
        <IngestModal
          open={true}
          onOpenChange={vi.fn()}
          onIngestComplete={vi.fn()}
          initialRepositories={mockRepos}
        />
      </AuthProvider>
    );

    // Initial render shows both repos
    expect(screen.getByText('argon-org/argon-private-core')).toBeInTheDocument();
    expect(screen.getByText('acme-inc/acme-web-client')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();

    // Search for "argon"
    const searchInput = screen.getByTestId('repo-search-input');
    fireEvent.change(searchInput, { target: { value: 'argon' } });

    await waitFor(() => {
      expect(screen.getByText('argon-org/argon-private-core')).toBeInTheDocument();
      expect(screen.queryByText('acme-inc/acme-web-client')).not.toBeInTheDocument();
    });

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText('acme-inc/acme-web-client')).toBeInTheDocument();
    });

    // Click org filter pill "acme-inc"
    const acmePill = screen.getByRole('button', { name: /acme-inc/i });
    fireEvent.click(acmePill);

    await waitFor(() => {
      expect(screen.queryByText('argon-org/argon-private-core')).not.toBeInTheDocument();
      expect(screen.getByText('acme-inc/acme-web-client')).toBeInTheDocument();
    });
  });

  it('transitions to ingestion progress and completes when "Index Repo" is clicked', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_authed' },
        user: { id: 'u_alice', name: 'Alice', isAnonymous: false },
      },
      isPending: false,
    });

    const onIngestCompleteSpy = vi.fn();
    const onOpenChangeSpy = vi.fn();

    render(
      <AuthProvider>
        <IngestModal
          open={true}
          onOpenChange={onOpenChangeSpy}
          onIngestComplete={onIngestCompleteSpy}
          initialRepositories={mockRepos}
        />
      </AuthProvider>
    );

    const indexBtn = screen.getByTestId('index-repo-button-101');
    fireEvent.click(indexBtn);

    // Progress display is active
    expect(screen.getByText('EXECUTING INGESTION PIPELINE...')).toBeInTheDocument();
    expect(screen.getByText('[CLONING]')).toBeInTheDocument();

    // Fast forward timers
    await waitFor(
      () => {
        expect(onIngestCompleteSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'argon-org/argon-private-core',
            repoUrl: 'https://github.com/argon-org/argon-private-core',
          })
        );
      },
      { timeout: 4000 }
    );
  });

  it('switches to "Public Git URL" tab and validates public URL input', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_authed' },
        user: { id: 'u_alice', name: 'Alice', isAnonymous: false },
      },
      isPending: false,
    });

    render(
      <AuthProvider>
        <IngestModal
          open={true}
          onOpenChange={vi.fn()}
          onIngestComplete={vi.fn()}
          initialRepositories={mockRepos}
        />
      </AuthProvider>
    );

    const publicTab = screen.getByTestId('tab-public-git-url');
    fireEvent.click(publicTab);

    expect(screen.getByTestId('ingest-url-input')).toBeInTheDocument();

    // Click ingest with empty input -> validation error
    const submitBtn = screen.getByTestId('submit-ingest-button');
    fireEvent.click(submitBtn);

    expect(screen.getByTestId('ingest-validation-error')).toHaveTextContent('Repository URL is required');
  });
});
