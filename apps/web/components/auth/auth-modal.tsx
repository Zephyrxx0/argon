'use client';

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Terminal, X, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/app/providers';

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { signInWithGithub, signOut, user, isAnonymous, isLoading: authLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGitHubSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signInWithGithub();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication request failed');
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signOut();
      onOpenChange(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to sign out');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isSubmitting) {
      if (!nextOpen) {
        setErrorMessage(null);
      }
      onOpenChange(nextOpen);
    }
  };

  const isAuthenticated = Boolean(user && !isAnonymous);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#090a0f]/85 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content
          data-testid="auth-modal"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-md border border-border bg-card shadow-[0_0_60px_rgba(0,0,0,0.85)] font-mono outline-none animate-in fade-in-0 zoom-in-95 duration-150 p-0 overflow-hidden"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2 text-accent">
              <Terminal className="w-4 h-4 text-accent" />
              <Dialog.Title className="text-xs font-bold tracking-widest uppercase text-foreground">
                ARGON // IDENTITY & AUTHENTICATION
              </Dialog.Title>
            </div>
            {!isSubmitting && (
              <Dialog.Close
                data-testid="close-auth-modal"
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Dialog.Close>
            )}
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-5">
            <Dialog.Description className="text-xs text-muted-foreground leading-relaxed">
              Authenticate with GitHub to access private workspaces and link session history.
            </Dialog.Description>

            {/* Error Banner */}
            {errorMessage && (
              <div
                data-testid="auth-error-banner"
                className="p-3 border border-destructive/50 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>GitHub authentication failed: {errorMessage}. Verify OAuth permissions and retry.</p>
                </div>
              </div>
            )}

            {/* Authenticated State Display */}
            {isAuthenticated ? (
              <div className="space-y-4">
                <div className="p-3 border border-border bg-muted/30 flex items-center gap-3">
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt={user?.name || 'User'}
                      className="w-10 h-10 rounded border border-border object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded border border-accent bg-accent/10 text-accent font-bold text-xs flex items-center justify-center">
                      {(user?.name || user?.email || 'U').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-foreground truncate">
                      {user?.name || user?.email || 'Authenticated User'}
                    </p>
                    <p className="text-[11px] text-accent tracking-wider uppercase">
                      ACTIVE SESSION IDENTIFIER
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleGitHubSignIn}
                    disabled={isSubmitting}
                    className="w-full py-2 px-3 text-xs font-bold uppercase tracking-wider text-accent border border-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>REDIRECTING TO GITHUB...</span>
                      </>
                    ) : (
                      <>
                        <GithubIcon className="w-3.5 h-3.5" />
                        <span>Switch Account</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSubmitting}
                    className="w-full py-2 px-3 text-xs font-bold uppercase tracking-wider text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              /* Anonymous / Unauthenticated State Display */
              <div className="space-y-4">
                {isSubmitting ? (
                  <div
                    data-testid="auth-loading-state"
                    className="py-6 flex flex-col items-center justify-center gap-3 border border-border bg-muted/20"
                  >
                    <Loader2 className="w-5 h-5 text-accent animate-spin" />
                    <span className="text-xs text-accent font-bold tracking-wider uppercase">
                      REDIRECTING TO GITHUB...
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      data-testid="github-signin-button"
                      onClick={handleGitHubSignIn}
                      disabled={isSubmitting || authLoading}
                      className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-accent border border-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                    >
                      <GithubIcon className="w-4 h-4" />
                      <span>Sign in with GitHub</span>
                    </button>

                    <button
                      type="button"
                      data-testid="continue-guest-button"
                      onClick={() => onOpenChange(false)}
                      disabled={isSubmitting}
                      className="w-full py-1 text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                    >
                      Continue as Guest
                    </button>
                  </div>
                )}

                {/* Guest Guarantee Note */}
                <div className="p-3 border border-border/80 bg-muted/20 flex items-start gap-2.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    Guest-first mode active. Your canvas state, query history, and active workspace will be preserved.
                  </span>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
