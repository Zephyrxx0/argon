'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GitFork, ChevronDown, Plus, Check, Trash2, RefreshCw } from 'lucide-react';
import { IngestModal } from './ingest-modal';
import { clsx } from 'clsx';
import { useAuth } from '@/app/providers';
import { startRefresh, waitForIngest } from '@/lib/ingest-client';
import {
  adoptGuestWorkspaces,
  loadCustomWorkspaces,
  saveCustomWorkspaces,
  storageKeyForOwner as storageKey,
} from '@/lib/custom-workspaces';

export interface Workspace {
  id: string;
  name: string;
  repoUrl: string;
  nodeCount?: number;
  isDefault?: boolean;
}

export const SHOWCASE_WORKSPACES: Workspace[] = [
  {
    id: 'ember-adr-showcase',
    name: 'Ember.js ADR Corpus',
    repoUrl: 'https://github.com/emberjs/rfcs',
    nodeCount: 184,
    isDefault: true,
  },
  {
    id: 'argon-dogfood',
    name: 'Argon Dogfood',
    repoUrl: 'https://github.com/argon/argon',
    nodeCount: 46,
  },
  {
    id: 'synthetic-demo',
    name: 'Instant Synthetic Graph',
    repoUrl: 'https://github.com/argon/synthetic-demo',
    nodeCount: 42,
  },
];

// Custom (ingested) workspaces are remembered per account (see lib/custom-workspaces.ts). Guest
// sessions get their own list, so one user's cloned repos never appear for another account.
export const storageKeyForOwner = storageKey;

/** Window event that removes a workspace from the remembered list (and leaves it if it is open). */
export const REMOVE_WORKSPACE_EVENT = 'argon:remove-workspace';

export interface WorkspaceSwitcherProps {
  workspaces?: Workspace[];
  currentWorkspaceId?: string;
  /** The account these custom workspaces belong to (guest sessions get their own bucket). */
  ownerId?: string | null;
  /** True for a signed-in account: the list of the guest session that was just linked is adopted. */
  authenticated?: boolean;
  onSelectWorkspace: (id: string) => void;
  onIngestSuccess?: (workspace: Workspace) => void;
  onRemoveWorkspace?: (id: string) => void;
  /** Called after a re-sync of one of the user's workspaces finished, so its data can be reloaded. */
  onResyncComplete?: (id: string) => void;
  className?: string;
}

type ResyncState = { phase: 'running' } | { phase: 'done' } | { phase: 'error'; message: string };

export function WorkspaceSwitcher({
  workspaces: baseWorkspaces = SHOWCASE_WORKSPACES,
  currentWorkspaceId = 'ember-adr-showcase',
  ownerId,
  authenticated = false,
  onSelectWorkspace,
  onIngestSuccess,
  onRemoveWorkspace,
  onResyncComplete,
  className,
}: WorkspaceSwitcherProps) {
  const { getToken } = useAuth();
  const [resync, setResync] = useState<Record<string, ResyncState>>({});
  const [customWorkspaces, setCustomWorkspaces] = useState<Workspace[]>([]);
  // Ingested repositories live in FalkorDB; remember them per account so they survive a reload
  // but never show for a different account.
  useEffect(() => {
    // Signing in links the guest session: its remembered workspaces now belong to the account
    // (the server moved their access), so they are carried over instead of being lost.
    const adopted = authenticated && ownerId ? adoptGuestWorkspaces<Workspace>(ownerId) : null;
    setCustomWorkspaces(adopted ?? loadCustomWorkspaces<Workspace>(ownerId));
  }, [ownerId, authenticated]);
  const workspaces = [
    ...baseWorkspaces,
    ...customWorkspaces.filter((c) => !baseWorkspaces.some((b) => b.id === c.id)),
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onSelectWorkspace(id);
    setIsOpen(false);
  };

  const persist = (next: Workspace[]) => saveCustomWorkspaces(ownerId, next);

  const handleIngestComplete = (newWorkspace: Workspace) => {
    setCustomWorkspaces((prev) => {
      const next = [newWorkspace, ...prev.filter((w) => w.id !== newWorkspace.id)].slice(0, 20);
      persist(next);
      return next;
    });
    onIngestSuccess?.(newWorkspace);
    onSelectWorkspace(newWorkspace.id);
  };

  const isCustom = (id: string) => customWorkspaces.some((w) => w.id === id);

  // Re-sync = re-read the repository (new commits, and GitHub PRs / reviews / issues since the last
  // ingestion). Only for workspaces the user ingested; the showcase graphs are static.
  const handleResync = async (workspace: Workspace) => {
    if (resync[workspace.id]?.phase === 'running') return;
    setResync((prev) => ({ ...prev, [workspace.id]: { phase: 'running' } }));
    try {
      const started = await startRefresh(workspace.id, await getToken());
      await waitForIngest(workspace.id, { getToken, jobId: started.jobId });
      setResync((prev) => ({ ...prev, [workspace.id]: { phase: 'done' } }));
      onResyncComplete?.(workspace.id);
    } catch (err) {
      setResync((prev) => ({
        ...prev,
        [workspace.id]: { phase: 'error', message: (err as Error)?.message || 'Re-sync failed' },
      }));
    }
  };

  const handleRemove = (id: string) => {
    setCustomWorkspaces((prev) => {
      const next = prev.filter((w) => w.id !== id);
      persist(next);
      return next;
    });
    // Leaving the workspace you were viewing: fall back to the default showcase
    if (id === currentWorkspaceId) {
      onSelectWorkspace(baseWorkspaces[0]?.id ?? 'ember-adr-showcase');
    }
    onRemoveWorkspace?.(id);
  };

  // "Remove from my list" from outside the dropdown (e.g. the banner of a workspace that no longer exists)
  const removeRef = useRef(handleRemove);
  removeRef.current = handleRemove;
  useEffect(() => {
    const onRemove = (e: Event) => {
      const id = (e as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId;
      if (id) removeRef.current(id);
    };
    window.addEventListener(REMOVE_WORKSPACE_EVENT, onRemove);
    return () => window.removeEventListener(REMOVE_WORKSPACE_EVENT, onRemove);
  }, []);

  return (
    <>
      <div ref={dropdownRef} className={clsx('relative font-mono', className)}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          data-testid="workspace-switcher-trigger"
          className="flex items-center gap-2 px-2.5 py-1.5 border border-border bg-card hover:border-accent text-xs transition-colors select-none"
        >
          <GitFork className="w-3.5 h-3.5 text-accent shrink-0" />
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-bold text-foreground leading-none truncate max-w-[130px] sm:max-w-[180px]">
              {activeWorkspace?.name || 'Select Workspace'}
            </span>
          </div>
          <ChevronDown
            className={clsx(
              'w-3.5 h-3.5 text-muted-foreground transition-transform ml-1',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div
            data-testid="workspace-dropdown"
            className="absolute right-0 mt-1 w-64 border border-border bg-card shadow-2xl z-40 overflow-hidden animate-in fade-in duration-100"
          >
            <div className="px-3 py-2 border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>WORKSPACES</span>
              <span>NODES</span>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
              {workspaces.map((workspace) => {
                const isSelected = workspace.id === activeWorkspace?.id;
                const custom = isCustom(workspace.id);
                return (
                  <div
                    key={workspace.id}
                    className={clsx(
                      'group flex items-center transition-colors',
                      isSelected ? 'bg-accent/10' : 'hover:bg-muted/60'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(workspace.id)}
                      data-testid={`workspace-item-${workspace.id}`}
                      className={clsx(
                        'flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left text-xs transition-colors',
                        isSelected ? 'text-accent font-semibold' : 'text-foreground group-hover:text-accent'
                      )}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        {isSelected ? (
                          <Check className="w-3 h-3 text-accent shrink-0" />
                        ) : (
                          <div className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{workspace.name}</span>
                      </div>
                      {workspace.nodeCount ? (
                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                          {workspace.nodeCount}n
                        </span>
                      ) : null}
                    </button>
                    {custom && (
                      <button
                        type="button"
                        onClick={() => handleResync(workspace)}
                        disabled={resync[workspace.id]?.phase === 'running'}
                        data-testid={`workspace-resync-${workspace.id}`}
                        aria-label={`Re-sync workspace ${workspace.name}`}
                        title="Re-sync: read new commits, pull requests, reviews and issues"
                        className="shrink-0 px-2 py-2 text-muted-foreground opacity-0 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100 disabled:text-accent"
                      >
                        <RefreshCw
                          className={clsx('w-3.5 h-3.5', resync[workspace.id]?.phase === 'running' && 'animate-spin')}
                        />
                      </button>
                    )}
                    {custom && (
                      <button
                        type="button"
                        onClick={() => handleRemove(workspace.id)}
                        data-testid={`workspace-remove-${workspace.id}`}
                        aria-label={`Remove workspace ${workspace.name}`}
                        title="Remove workspace"
                        className="shrink-0 px-2.5 py-2 text-muted-foreground opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {Object.entries(resync).map(([id, st]) => {
              const name = workspaces.find((w) => w.id === id)?.name ?? id;
              if (st.phase === 'done') {
                return (
                  <div
                    key={id}
                    role="status"
                    data-testid={`workspace-resync-status-${id}`}
                    className="px-3 py-1.5 border-t border-border text-[10px] text-success"
                  >
                    {name}: re-synced
                  </div>
                );
              }
              if (st.phase === 'error') {
                return (
                  <div
                    key={id}
                    role="alert"
                    data-testid={`workspace-resync-status-${id}`}
                    className="px-3 py-1.5 border-t border-border text-[10px] text-danger"
                  >
                    {name}: {st.message}
                  </div>
                );
              }
              return (
                <div
                  key={id}
                  role="status"
                  data-testid={`workspace-resync-status-${id}`}
                  className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground"
                >
                  {name}: re-syncing…
                </div>
              );
            })}

            {/* Ingest Repository Trigger */}
            <div className="p-1.5 border-t border-border bg-muted/20">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsIngestModalOpen(true);
                }}
                data-testid="open-ingest-modal-button"
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-accent border border-dashed border-accent/40 bg-accent/5 hover:bg-accent/15 transition-colors uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ INGEST GIT REPO</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ingest Modal */}
      <IngestModal
        open={isIngestModalOpen}
        onOpenChange={setIsIngestModalOpen}
        onIngestComplete={handleIngestComplete}
      />
    </>
  );
}
