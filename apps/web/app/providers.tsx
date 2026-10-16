'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { authClient, useSession } from '@/lib/auth-client';

export interface AuthContextValue {
  session: any;
  user: any;
  isAnonymous: boolean;
  isLoading: boolean;
  getToken: () => Promise<string | null>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: sessionData, isPending } = useSession();
  const [cachedToken, setCachedToken] = useState<string | null>(null);
  const hasRequestedGuestRef = useRef(false);

  // Mint anonymous session on first load if no session exists (AUTH-02, D-04, D-06)
  useEffect(() => {
    if (!isPending && !sessionData?.session && !hasRequestedGuestRef.current) {
      hasRequestedGuestRef.current = true;
      authClient.signIn.anonymous().catch((err: unknown) => {
        console.error('[AuthProvider] Failed to establish guest session:', err);
      });
    }
  }, [isPending, sessionData]);

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      if (typeof (authClient as any).token === 'function') {
        const res = await (authClient as any).token();
        if (res?.data?.token) {
          setCachedToken(res.data.token);
          return res.data.token;
        }
      }
      if (typeof window !== 'undefined') {
        const fetchRes = await fetch('/api/auth/token');
        if (fetchRes.ok) {
          const data = await fetchRes.json();
          if (data.token) {
            setCachedToken(data.token);
            return data.token;
          }
        }
      }
    } catch {
      // Fallback to cached token if network glitch
    }
    return cachedToken;
  }, [cachedToken]);

  const signInWithGithub = useCallback(async () => {
    await authClient.signIn.social({
      provider: 'github',
      callbackURL: typeof window !== 'undefined' ? window.location.href : '/',
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    // D-15: Mint a fresh anonymous session immediately after logout
    hasRequestedGuestRef.current = false;
    await authClient.signIn.anonymous();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  const isAnonymous = Boolean(sessionData?.user && (sessionData.user as any).isAnonymous);

  return (
    <AuthContext.Provider
      value={{
        session: sessionData?.session ?? null,
        user: sessionData?.user ?? null,
        isAnonymous,
        isLoading: isPending,
        getToken,
        signInWithGithub,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
