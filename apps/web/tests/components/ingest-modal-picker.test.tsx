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

/** Fakes the gateway: POST ingest(-public) -> queued, GET ingest-status -> given sequence. */
function mockGateway(opts: {
  workspaceId: string;
  statuses?: Array<Record<string, unknown>>;
  startStatus?: number;
  startError?: string;
}) {
  const statuses = opts.statuses ?? [
    { status: 'cloning', progress: 0.15, nodeCount: 0, error: null },
    { status: 'completed', progress: 1, nodeCount: 287, error: null },
  ];
  let i = 0;
  const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (opts.startStatus && opts.startStatus >= 400) {
        return Promise.resolve({ ok: false, status: opts.startStatus, json: () => Promise.resolve({ error: opts.startError }) });
      }
      return Promise.resolve({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ status: 'queued', workspaceId: opts.workspaceId, repositoryFullName: 'x/y' }),
      });
    }
    const st = statuses[Math.min(i++, statuses.length - 1)]!;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ workspaceId: opts.workspaceId, ...st }),
    });
  });
  global.fetch = fetchMock as any;
  return fetchMock;
}

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
    mockGateway({ workspaceId: 'argon-org-argon-private-core' });

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
            // the id comes from the gateway, not from the client
            id: 'argon-org-argon-private-core',
            name: 'argon-org/argon-private-core',
            repoUrl: 'https://github.com/argon-org/argon-private-core',
            nodeCount: 287,
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

  describe('Public Git URL ingestion (real gateway job)', () => {
    const asGuest = () =>
      (authClientModule.useSession as any).mockReturnValue({
        data: { session: { id: 's_guest' }, user: { id: 'u_guest', name: 'Anonymous', isAnonymous: true } },
        isPending: false,
      });

    const openUrlTab = (props: Partial<React.ComponentProps<typeof IngestModal>> = {}) => {
      render(
        <AuthProvider>
          <IngestModal open={true} onOpenChange={vi.fn()} onIngestComplete={vi.fn()} {...props} />
        </AuthProvider>
      );
      fireEvent.click(screen.getByTestId('tab-public-git-url'));
    };

    it('starts a real job via ingest-public, polls status, and hands back the gateway workspace id', async () => {
      asGuest();
      const fetchMock = mockGateway({ workspaceId: 'pub-zephyrxx0-treads-a1b2c3' });
      const onIngestComplete = vi.fn();
      const onOpenChange = vi.fn();
      openUrlTab({ onIngestComplete, onOpenChange });

      fireEvent.change(screen.getByTestId('ingest-url-input'), {
        target: { value: 'https://github.com/Zephyrxx0/treads' },
      });
      fireEvent.click(screen.getByTestId('submit-ingest-button'));

      await waitFor(
        () =>
          expect(onIngestComplete).toHaveBeenCalledWith({
            id: 'pub-zephyrxx0-treads-a1b2c3',
            name: 'Zephyrxx0/treads',
            repoUrl: 'https://github.com/Zephyrxx0/treads',
            nodeCount: 287,
          }),
        { timeout: 6000 }
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);

      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
      expect(post[0]).toBe('/api/v1/workspaces/ingest-public');
      expect(JSON.parse(post[1].body)).toEqual({ repoUrl: 'https://github.com/Zephyrxx0/treads' });
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/pub-zephyrxx0-treads-a1b2c3/ingest-status'))).toBe(true);
    });

    it('shows the failure reason from a failed job and lets the user go back', async () => {
      asGuest();
      mockGateway({
        workspaceId: 'pub-a-b-000000',
        statuses: [{ status: 'failed', progress: 0, nodeCount: 0, error: 'repository not found' }],
      });
      const onIngestComplete = vi.fn();
      openUrlTab({ onIngestComplete });

      fireEvent.change(screen.getByTestId('ingest-url-input'), { target: { value: 'https://github.com/a/b' } });
      fireEvent.click(screen.getByTestId('submit-ingest-button'));

      expect(await screen.findByTestId('ingest-error', {}, { timeout: 4000 })).toHaveTextContent('repository not found');
      expect(screen.getByText('INGESTION FAILED')).toBeInTheDocument();
      expect(onIngestComplete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('ingest-retry-button'));
      expect(screen.getByTestId('ingest-url-input')).toBeInTheDocument();
    });

    it('shows the gateway rejection (e.g. 429 busy) instead of pretending to succeed', async () => {
      asGuest();
      mockGateway({ workspaceId: 'x', startStatus: 429, startError: 'You already have an ingestion in progress.' });
      const onIngestComplete = vi.fn();
      openUrlTab({ onIngestComplete });

      fireEvent.change(screen.getByTestId('ingest-url-input'), { target: { value: 'https://github.com/a/b' } });
      fireEvent.click(screen.getByTestId('submit-ingest-button'));

      expect(await screen.findByTestId('ingest-error')).toHaveTextContent('already have an ingestion in progress');
      expect(onIngestComplete).not.toHaveBeenCalled();
    });
  });
});
