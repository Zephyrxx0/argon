'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Terminal } from 'lucide-react';
import { CommandBar } from '@/components/command/command-bar';
import { WorkspaceSwitcher, type Workspace } from '@/components/workspace/workspace-switcher';
import type { PaletteSearchFn } from '@/lib/palette-search-client';
import { ContributorPicker } from '@/components/contributor/contributor-picker';
import { UserButton } from '@/components/auth/user-button';
import { AuthModal } from '@/components/auth/auth-modal';
import { useAuth } from '@/app/providers';
import { clsx } from 'clsx';
import type { WorkspaceSuggestions } from '@/lib/scenarios';

export interface HeaderBarProps {
  currentQuery?: string;
  isLoading?: boolean;
  error?: string | null;
  onSubmitQuery: (query: string) => void;
  suggestions?: WorkspaceSuggestions;
  onSemanticSearch?: PaletteSearchFn;
  currentWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
  onIngestSuccess?: (workspace: Workspace) => void;
  onRemoveWorkspace?: (id: string) => void;
  onResyncComplete?: (id: string) => void;
  /** Increments after each finished re-sync (reloads the contributor list). */
  resyncVersion?: number;
  currentContributorId?: string | null;
  onSelectContributor: (id: string | null) => void;
  className?: string;
}

export function HeaderBar({
  currentQuery = '',
  isLoading = false,
  error = null,
  onSubmitQuery,
  suggestions,
  onSemanticSearch,
  currentWorkspaceId = 'ember-adr-showcase',
  onSelectWorkspace,
  onIngestSuccess,
  onRemoveWorkspace,
  onResyncComplete,
  resyncVersion = 0,
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
        'h-14 border-b border-border bg-background px-3 sm:px-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 shrink-0 z-30 font-mono',
        className
      )}
    >
      {/* Left: Branding */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 justify-self-start">
        <Link
          href="/"
          aria-label="Argon home"
          className="flex items-center gap-2 text-foreground hover:bg-foreground hover:text-background px-1.5 py-0.5 -mx-1.5 transition-colors"
        >
          <Terminal className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-xs sm:text-sm font-black tracking-[0.3em] uppercase">
            ARGON
          </span>
        </Link>
      </div>

      {/* Center: Command Bar — fixed column so it never shifts with side-cluster width */}
      <div className="w-[clamp(220px,42vw,560px)] px-1 sm:px-4 justify-self-center">
        <CommandBar
          value={currentQuery}
          isLoading={isLoading}
          error={error}
          onSubmit={onSubmitQuery}
          suggestions={suggestions}
          onSemanticSearch={onSemanticSearch}
        />
      </div>

      {/* Right: Workspace Switcher, Contributor Identity & Auth Cluster */}
      <div className="flex items-center gap-2 min-w-0 justify-self-end">
        <WorkspaceSwitcher
          currentWorkspaceId={currentWorkspaceId}
          ownerId={user?.id ?? null}
          authenticated={isAuthenticated}
          onSelectWorkspace={onSelectWorkspace}
          onIngestSuccess={onIngestSuccess}
          onRemoveWorkspace={onRemoveWorkspace}
          onResyncComplete={onResyncComplete}
        />

        <ContributorPicker
          workspaceId={currentWorkspaceId}
          currentContributorId={currentContributorId}
          onSelectContributor={onSelectContributor}
          reloadKey={resyncVersion}
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
