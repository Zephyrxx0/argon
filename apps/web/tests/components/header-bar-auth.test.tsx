import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeaderBar } from '@/components/navigation/header-bar';
import * as authClientModule from '@/lib/auth-client';
import { AuthProvider } from '@/app/providers';

vi.mock('@/lib/auth-client', () => {
  const mockSignInAnonymous = vi.fn().mockResolvedValue({ user: { isAnonymous: true } });
  const mockSignInSocial = vi.fn().mockResolvedValue({});
  const mockSignOut = vi.fn().mockResolvedValue({});
  const mockToken = vi.fn().mockResolvedValue({ data: { token: 'mock.bearer.token' } });

  return {
    authClient: {
      signIn: {
        anonymous: mockSignInAnonymous,
        social: mockSignInSocial,
      },
      signOut: mockSignOut,
      token: mockToken,
    },
    useSession: vi.fn(),
    signIn: vi.fn(),
    signOut: mockSignOut,
  };
});

describe('HeaderBar Auth Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders guest indicator pill and Sign In button when anonymous', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_guest' },
        user: { id: 'u_guest', name: 'Anonymous', isAnonymous: true },
      },
      isPending: false,
    });

    render(
      <AuthProvider>
        <HeaderBar
          onSubmitQuery={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onSelectContributor={vi.fn()}
        />
      </AuthProvider>
    );

    const guestPill = screen.getByTestId('header-guest-pill');
    expect(guestPill).toBeInTheDocument();
    expect(guestPill).toHaveTextContent('Guest');

    const signInBtn = screen.getByTestId('header-signin-button');
    expect(signInBtn).toBeInTheDocument();
    expect(signInBtn).toHaveTextContent('Sign In');
  });

  it('opens in-place AuthModal when Sign In is clicked without unmounting header or canvas', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_guest' },
        user: { id: 'u_guest', name: 'Anonymous', isAnonymous: true },
      },
      isPending: false,
    });

    render(
      <AuthProvider>
        <HeaderBar
          onSubmitQuery={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onSelectContributor={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();

    const signInBtn = screen.getByTestId('header-signin-button');
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
    });

    // Verify copy contract from UI-SPEC.md
    expect(screen.getByText('ARGON // IDENTITY & AUTHENTICATION')).toBeInTheDocument();
    expect(screen.getByText('Sign in with GitHub')).toBeInTheDocument();
    expect(screen.getByText('Continue as Guest')).toBeInTheDocument();
    expect(
      screen.getByText(/Guest-first mode active. Your canvas state, query history, and active workspace will be preserved./i)
    ).toBeInTheDocument();

    // Closing modal via Continue as Guest
    const continueBtn = screen.getByTestId('continue-guest-button');
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    });
  });

  it('renders authenticated user handle @{login} when authenticated', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 's_auth' },
        user: { id: 'u_octocat', name: 'octocat', email: 'octocat@github.com', isAnonymous: false },
      },
      isPending: false,
    });

    render(
      <AuthProvider>
        <HeaderBar
          onSubmitQuery={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onSelectContributor={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.queryByTestId('header-guest-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header-signin-button')).not.toBeInTheDocument();

    const trigger = screen.getByTestId('user-button-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('@octocat');
  });

  it('renders skeleton pill during session loading state', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: null,
      isPending: true,
    });

    render(
      <AuthProvider>
        <HeaderBar
          onSubmitQuery={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onSelectContributor={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-skeleton-pill')).toBeInTheDocument();
  });
});
