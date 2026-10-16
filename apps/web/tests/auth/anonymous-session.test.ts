import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/app/providers';
import * as authClientModule from '@/lib/auth-client';

vi.mock('@/lib/auth-client', () => {
  const mockSignInAnonymous = vi.fn().mockResolvedValue({ user: { isAnonymous: true } });
  const mockSignInSocial = vi.fn().mockResolvedValue({});
  const mockSignOut = vi.fn().mockResolvedValue({});
  const mockToken = vi.fn().mockResolvedValue({ data: { token: 'guest.jwt.token' } });

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

function TestConsumer({ onAuth }: { onAuth?: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  useEffect(() => {
    if (onAuth) onAuth(auth);
  }, [auth, onAuth]);

  return React.createElement(
    'div',
    null,
    React.createElement('span', { 'data-testid': 'is-anonymous' }, auth.isAnonymous ? 'true' : 'false'),
    React.createElement('span', { 'data-testid': 'is-loading' }, auth.isLoading ? 'loading' : 'ready'),
    React.createElement('span', { 'data-testid': 'user-id' }, auth.user?.id || 'none')
  );
}

describe('Anonymous Guest Session & AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers authClient.signIn.anonymous when session is null and not loading', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: null,
      isPending: false,
    });

    render(React.createElement(AuthProvider, null, React.createElement(TestConsumer)));

    await waitFor(() => {
      expect(authClientModule.authClient.signIn.anonymous).toHaveBeenCalledTimes(1);
    });
  });

  it('does not trigger signIn.anonymous while session hydration is pending', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: null,
      isPending: true,
    });

    render(React.createElement(AuthProvider, null, React.createElement(TestConsumer)));

    expect(authClientModule.authClient.signIn.anonymous).not.toHaveBeenCalled();
    expect(screen.getByTestId('is-loading')).toHaveTextContent('loading');
  });

  it('correctly identifies anonymous user when user.isAnonymous is true', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 'sess_123', userId: 'guest_abc' },
        user: { id: 'guest_abc', name: 'Anonymous', isAnonymous: true },
      },
      isPending: false,
    });

    render(React.createElement(AuthProvider, null, React.createElement(TestConsumer)));

    expect(screen.getByTestId('is-anonymous')).toHaveTextContent('true');
    expect(screen.getByTestId('user-id')).toHaveTextContent('guest_abc');
    expect(authClientModule.authClient.signIn.anonymous).not.toHaveBeenCalled();
  });

  it('correctly identifies authenticated user when user.isAnonymous is false/undefined', () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 'sess_456', userId: 'user_octocat' },
        user: { id: 'user_octocat', name: 'Octocat', isAnonymous: false },
      },
      isPending: false,
    });

    render(React.createElement(AuthProvider, null, React.createElement(TestConsumer)));

    expect(screen.getByTestId('is-anonymous')).toHaveTextContent('false');
    expect(screen.getByTestId('user-id')).toHaveTextContent('user_octocat');
  });

  it('getToken returns token from authClient.token', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 'sess_123', userId: 'guest_abc' },
        user: { id: 'guest_abc', name: 'Anonymous', isAnonymous: true },
      },
      isPending: false,
    });

    let authContext: ReturnType<typeof useAuth> | null = null;

    render(
      React.createElement(AuthProvider, null,
        React.createElement(TestConsumer, { onAuth: (auth) => { authContext = auth; } })
      )
    );

    expect(authContext).not.toBeNull();
    let token: string | null = null;
    await waitFor(async () => {
      token = await authContext!.getToken();
    });
    expect(token).toBe('guest.jwt.token');
  });
});
