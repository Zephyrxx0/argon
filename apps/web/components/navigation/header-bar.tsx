'use client';

import React, { useState } from 'react';
import { Terminal, Database } from 'lucide-react';
import { CommandBar } from '@/components/command/command-bar';
import { WorkspaceSwitcher, type Workspace } from '@/components/workspace/workspace-switcher';
import { ContributorPicker } from '@/components/contributor/contributor-picker';
import { UserButton } from '@/components/auth/user-button';
import { AuthModal } from '@/components/auth/auth-modal';
import { useAuth } from '@/app/providers';
import { clsx } from 'clsx';

export interface HeaderBarProps {
  currentQuery?: string;
  isLoading?: boolean;
  error?: string | null;
  onSubmitQuery: (query: string) => void;
  currentWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
  onIngestSuccess?: (workspace: Workspace) => void;
  currentContributorId?: string | null;
  onSelectContributor: (id: string | null) => void;
  className?: string;
}

export function HeaderBar({
  currentQuery = '',
  isLoading = false,
  error = null,
  onSubmitQuery,
  currentWorkspaceId = 'ember-adr-showcase',
  onSelectWorkspace,
  onIngestSuccess,
  currentContributorId = null,
  onSelectContributor,
  className,
}: HeaderBarProps) {
  const { user, isAnonymous, isLoading: authLoading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const isAuthenticated = Boolean(user && !isAnonymous);

  return (
    <header
      className={clsx(
        'h-14 border-b border-border bg-card/95 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-30 font-mono',
        className
      )}
    >
      {/* Left: Branding & Engine Indicator */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-1.5 text-accent">
          <Terminal className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-xs sm:text-sm font-black tracking-widest uppercase">
            ARGON // 2077
          </span>
        </div>
        <div className="hidden lg:flex items-center gap-1 px-1.5 py-0.5 border border-border bg-muted/30 text-[10px] text-muted-foreground uppercase">
          <Database className="w-2.5 h-2.5 text-warning" />
          <span>FalkorDB v0.1</span>
        </div>
      </div>

      {/* Center: Dual-Invocation Command Bar */}
      <div className="flex-1 max-w-xl mx-auto px-1 sm:px-4">
        <CommandBar
          value={currentQuery}
          isLoading={isLoading}
          error={error}
          onSubmit={onSubmitQuery}
        />
      </div>

      {/* Right: Workspace Switcher, Contributor Identity & Auth Cluster */}
      <div className="flex items-center gap-2 shrink-0">
        <WorkspaceSwitcher
          currentWorkspaceId={currentWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onIngestSuccess={onIngestSuccess}
        />

        <ContributorPicker
          currentContributorId={currentContributorId}
          onSelectContributor={onSelectContributor}
        />

        {/* Identity Cluster (Immediately to the right of ContributorPicker - D-02) */}
        {authLoading ? (
          <div
            data-testid="auth-skeleton-pill"
            className="w-20 h-7 bg-muted/40 animate-pulse border border-border"
          />
        ) : isAuthenticated ? (
          <UserButton onOpenAuthModal={() => setAuthModalOpen(true)} />
        ) : (
          <div className="flex items-center gap-1.5" data-testid="guest-identity-cluster">
            <span
              data-testid="header-guest-pill"
              className="border border-border bg-muted/30 text-xs px-2 py-1 text-muted-foreground uppercase font-bold"
            >
              Guest
            </span>
            <button
              type="button"
              data-testid="header-signin-button"
              onClick={() => setAuthModalOpen(true)}
              className="text-accent border border-accent/40 hover:border-accent hover:bg-accent/10 text-xs px-2.5 py-1 uppercase tracking-wider font-bold transition-colors cursor-pointer"
            >
              Sign In
            </button>
          </div>
        )}
      </div>

      {/* In-place Authentication Dialog */}
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </header>
  );
}
