'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, UserCheck, ChevronDown, Search, X, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/app/providers';
import { useWorkspaceResource } from '@/lib/use-workspace-resource';
import { githubLogin } from '@/lib/github-identity';
import type { ContributorsResponse, WorkspaceContributor } from '@/lib/workspace-data';

export interface Contributor {
  id: string;
  name: string;
  role: string;
  commits: number;
  lastActive: string;
  avatarUrl?: string;
  login?: string;
  userId?: string;
}

/** "3d ago" style label for an epoch-seconds timestamp. */
export function formatLastActive(epochSeconds: number | null | undefined, nowMs: number = Date.now()): string {
  if (!epochSeconds) return 'unknown';
  const seconds = Math.max(0, Math.floor(nowMs / 1000 - epochSeconds));
  const units: Array<[number, string]> = [
    [365 * 86400, 'y'],
    [30 * 86400, 'mo'],
    [7 * 86400, 'w'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
  }
  return 'just now';
}

export function toContributor(c: WorkspaceContributor, nowMs?: number): Contributor {
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    commits: c.commits,
    lastActive: formatLastActive(c.lastActiveAt, nowMs),
    ...(c.avatarUrl ? { avatarUrl: c.avatarUrl } : {}),
    ...(c.userId ? { userId: c.userId } : {}),
  };
}

export interface ContributorPickerProps {
  /** Workspace whose contributors to load. Required unless `contributors` is supplied. */
  workspaceId?: string;
  /** Explicit list (tests / storybook). Skips loading. */
  contributors?: Contributor[];
  currentContributorId?: string | null;
  onSelectContributor: (contributorId: string | null) => void;
  /** Change to reload the list (e.g. after the workspace was re-synced). */
  reloadKey?: number;
  className?: string;
}

export function ContributorPicker({
  workspaceId,
  contributors: contributorsProp,
  currentContributorId = null,
  onSelectContributor,
  reloadKey = 0,
  className,
}: ContributorPickerProps) {
  const { user, isAnonymous, getToken } = useAuth();
  const loaded = useWorkspaceResource<ContributorsResponse>(
    workspaceId ?? '',
    'contributors',
    getToken,
    // an explicit list (or no workspace) means there is nothing to load
    !contributorsProp && Boolean(workspaceId),
    `${user?.id ?? ''}#${reloadKey}`
  );
  const contributors: Contributor[] = useMemo(() => {
    if (contributorsProp) return contributorsProp;
    return loaded.status === 'ready' ? loaded.data.contributors.map((c) => toContributor(c)) : [];
  }, [contributorsProp, loaded]);
  const loadState = contributorsProp || !workspaceId ? 'ready' : loaded.status;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeContributor = contributors.find((c) => c.id === currentContributorId);

  const myLogin = githubLogin(user);
  const matchesUser = (c: Contributor) => {
    if (isAnonymous || !user) return false;
    if (c.userId && c.userId === user.id) return true;
    const login = myLogin?.toLowerCase();
    if (!login) return false;
    return c.id.toLowerCase() === login || c.name.toLowerCase() === login;
  };
  const checkIsYou = matchesUser;

  // On login, default the identity to the signed-in user (if they appear in this workspace),
  // falling back to Guest. Only applies while the user hasn't chosen one themselves.
  const autoSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (contributorsProp) return; // controlled list: don't auto-pick
    const sig = `${workspaceId}:${user?.id ?? 'guest'}`;
    if (autoSelectedRef.current === sig) return;
    if (loadState !== 'ready') return;
    autoSelectedRef.current = sig;
    if (currentContributorId) return; // user (or page) already has a selection
    const me = contributors.find(matchesUser);
    if (me) onSelectContributor(me.id);
    // no match => stays Guest (fallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, workspaceId, user?.id, contributors, contributorsProp]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = contributors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string | null) => {
    onSelectContributor(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={dropdownRef} className={clsx('relative font-mono', className)}>
      {/* Contributor Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="contributor-picker-trigger"
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 border text-xs transition-colors select-none',
          activeContributor
            ? 'border-accent bg-accent/10 text-foreground hover:bg-accent/20'
            : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground'
        )}
      >
        {activeContributor ? (
          <UserCheck className="w-3.5 h-3.5 text-foreground shrink-0" />
        ) : (
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium truncate max-w-[100px] sm:max-w-[140px]">
          {activeContributor ? activeContributor.name : 'Guest'}
        </span>
        {activeContributor && checkIsYou(activeContributor) && (
          <span
            data-testid="contributor-trigger-you-badge"
            className="text-[9px] font-bold text-accent bg-accent/20 px-1 border border-accent/40 rounded shrink-0"
          >
            YOU
          </span>
        )}
        {activeContributor && (
          <span className="hidden md:inline-block text-[10px] text-foreground/80 bg-foreground/10 px-1 border border-foreground/30">
            {activeContributor.role.split(' ')[0]}
          </span>
        )}
        <ChevronDown
          className={clsx(
            'w-3 h-3 text-muted-foreground transition-transform ml-0.5',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Searchable Combobox Dropdown */}
      {isOpen && (
        <div
          data-testid="contributor-dropdown"
          className="absolute right-0 mt-1 w-72 border border-border bg-card shadow-2xl z-40 overflow-hidden animate-in fade-in duration-100"
        >
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="flex items-center px-2 py-1 bg-background border border-border">
              <Search className="w-3 h-3 text-muted-foreground mr-1.5 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search author by name or role..."
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono"
                autoFocus
                data-no-focus-ring
                data-testid="contributor-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border flex items-center justify-between">
            <span>WHO AM I? (PERSONALIZED BRIEFING)</span>
            <span>COMMITS</span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
            {filtered.length === 0 ? (
              <div
                data-testid="contributor-empty"
                role={loadState === 'error' ? 'alert' : 'status'}
                className={clsx(
                  'p-3 text-center text-xs',
                  loadState === 'error' ? 'text-danger' : 'text-muted-foreground'
                )}
              >
                {loadState === 'loading'
                  ? 'Reading contributors from the graph…'
                  : loadState === 'error'
                    ? 'Could not load contributors for this workspace.'
                    : contributors.length === 0
                      ? 'No contributors were indexed for this workspace.'
                      : 'No matching contributors found.'}
              </div>
            ) : (
              filtered.map((contributor) => {
                const isSelected = contributor.id === activeContributor?.id;
                const isYou = checkIsYou(contributor);
                return (
                  <button
                    key={contributor.id}
                    type="button"
                    onClick={() => handleSelect(contributor.id)}
                    data-testid={`contributor-item-${contributor.id}`}
                    className={clsx(
                      'w-full flex items-center justify-between p-2.5 text-left text-xs transition-colors gap-2',
                      isSelected
                        ? 'bg-accent/10 text-foreground border-l-2 border-accent'
                        : 'text-foreground hover:bg-muted/60 hover:text-accent'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {contributor.avatarUrl ? (
                        <img
                          src={contributor.avatarUrl}
                          alt={contributor.name}
                          className="w-7 h-7 rounded-full border border-border shrink-0 object-cover"
                        />
                      ) : null}
                      <div className="space-y-0.5 truncate">
                        <div className="flex items-center gap-1.5 font-bold">
                          {isSelected && <Check className="w-3 h-3 text-foreground shrink-0" />}
                          <span className="truncate">{contributor.name}</span>
                          {isYou && (
                            <span
                              data-testid="contributor-you-badge"
                              className="bg-accent/20 text-accent border border-accent/40 font-mono text-[9px] font-bold px-1 py-0.2 rounded shrink-0"
                            >
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span className="text-foreground">{contributor.role}</span>
                          <span>•</span>
                          <span>Active {contributor.lastActive}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {contributor.commits} {contributor.commits === 1 ? "commit" : "commits"}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Reset / Guest Mode Trigger */}
          <div className="p-2 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              data-testid="clear-contributor-button"
              className="w-full flex items-center justify-center gap-1.5 py-1 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border bg-card transition-colors uppercase"
            >
              <span>RESET TO GUEST (UNASSIGNED)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
