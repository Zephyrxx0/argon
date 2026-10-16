import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/app/providers';
import * as authClientModule from '@/lib/auth-client';
import {
  PREFERENCES_STORAGE_KEY,
  getStoredPreferences,
  saveStoredPreferences,
} from '@/lib/preferences';

vi.mock('@/lib/auth-client', () => {
  const mockSignInAnonymous = vi.fn().mockResolvedValue({ user: { isAnonymous: true } });
  const mockSignOut = vi.fn().mockResolvedValue({});
  const mockToken = vi.fn().mockResolvedValue({ data: { token: 'guest.jwt.token' } });

  return {
    authClient: {
      signIn: {
        anonymous: mockSignInAnonymous,
        social: vi.fn(),
      },
      signOut: mockSignOut,
      token: mockToken,
    },
    useSession: vi.fn(),
    signIn: vi.fn(),
    signOut: mockSignOut,
  };
});

function TestSignOutConsumer({
  onAuthReady,
}: {
  onAuthReady?: (auth: ReturnType<typeof useAuth>) => void;
}) {
  const auth = useAuth();

  useEffect(() => {
    if (onAuthReady) {
      onAuthReady(auth);
    }
  }, [auth, onAuthReady]);

  return React.createElement(
    'div',
    null,
    React.createElement('span', { 'data-testid': 'active-workspace' }, auth.activeWorkspace),
    React.createElement('span', { 'data-testid': 'user-id' }, auth.user?.id || 'anonymous'),
    React.createElement(
      'button',
      {
        'data-testid': 'switch-ws-btn',
        onClick: () => auth.setActiveWorkspace('private-org/repo'),
      },
      'Switch Workspace'
    ),
    React.createElement(
      'button',
      {
        'data-testid': 'sign-out-btn',
        onClick: () => auth.signOut(),
      },
      'Sign Out'
    )
  );
}

describe('Sign-Out & Preference Retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('revokes session, mints anonymous guest identity, and resets workspace to ember-adr-showcase (D-15)', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 'sess_auth_999', userId: 'user_dev' },
        user: { id: 'user_dev', name: 'DevUser', isAnonymous: false },
      },
      isPending: false,
    });

    let authInstance: ReturnType<typeof useAuth> | null = null;
    let eventReceived: string | null = null;

    const eventListener = (e: Event) => {
      const customEvent = e as CustomEvent<{ workspaceId?: string }>;
      eventReceived = customEvent.detail?.workspaceId || null;
    };
    window.addEventListener('argon:reset-workspace', eventListener);

    render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(TestSignOutConsumer, {
          onAuthReady: (auth) => {
            authInstance = auth;
          },
        })
      )
    );

    // Initial state
    expect(screen.getByTestId('active-workspace')).toHaveTextContent('ember-adr-showcase');

    // Switch to a private workspace
    act(() => {
      authInstance?.setActiveWorkspace('private-org/repo');
    });
    expect(screen.getByTestId('active-workspace')).toHaveTextContent('private-org/repo');

    // Trigger signOut
    await act(async () => {
      await authInstance?.signOut();
    });

    // Verify authClient calls: signOut then immediately signIn.anonymous
    expect(authClientModule.authClient.signOut).toHaveBeenCalledTimes(1);
    expect(authClientModule.authClient.signIn.anonymous).toHaveBeenCalledTimes(1);

    // Verify workspace state reset to ember-adr-showcase
    expect(screen.getByTestId('active-workspace')).toHaveTextContent('ember-adr-showcase');

    // Verify custom event was dispatched
    expect(eventReceived).toBe('ember-adr-showcase');

    window.removeEventListener('argon:reset-workspace', eventListener);
  });

  it('preserves localStorage UI preferences and query history across sign-out (D-16)', async () => {
    (authClientModule.useSession as any).mockReturnValue({
      data: {
        session: { id: 'sess_123', userId: 'user_dev' },
        user: { id: 'user_dev', name: 'DevUser', isAnonymous: false },
      },
      isPending: false,
    });

    // Populate user UI preferences and query history in localStorage
    const savedPrefs = {
      layoutMode: 'concentric',
      split_viewport_sizes: [35, 65] as [number, number],
      query_history: ['blast radius for BillingEngine', 'who knows about retry.ts'],
    };
    saveStoredPreferences(savedPrefs);
    localStorage.setItem('query_history', JSON.stringify(savedPrefs.query_history));

    let authInstance: ReturnType<typeof useAuth> | null = null;
    render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(TestSignOutConsumer, {
          onAuthReady: (auth) => {
            authInstance = auth;
          },
        })
      )
    );

    // Switch workspace before signing out
    act(() => {
      authInstance?.setActiveWorkspace('team-alpha/service-x');
    });

    // Execute sign out
    await act(async () => {
      await authInstance?.signOut();
    });

    // Verify localStorage was NOT wiped or reset
    const storedPrefsJson = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    expect(storedPrefsJson).not.toBeNull();
    const storedPrefs = JSON.parse(storedPrefsJson!);
    expect(storedPrefs.layoutMode).toBe('concentric');
    expect(storedPrefs.split_viewport_sizes).toEqual([35, 65]);
    expect(storedPrefs.query_history).toEqual([
      'blast radius for BillingEngine',
      'who knows about retry.ts',
    ]);

    const standaloneHistory = localStorage.getItem('query_history');
    expect(standaloneHistory).not.toBeNull();
    expect(JSON.parse(standaloneHistory!)).toEqual([
      'blast radius for BillingEngine',
      'who knows about retry.ts',
    ]);

    // Verify preference getter returns identical intact preferences
    const activePrefs = getStoredPreferences();
    expect(activePrefs.layoutMode).toBe('concentric');
    expect(activePrefs.split_viewport_sizes).toEqual([35, 65]);
    expect(activePrefs.query_history.length).toBe(2);
  });
});
