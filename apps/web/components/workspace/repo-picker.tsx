'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { Search, Lock, Globe, RefreshCw, AlertTriangle, ExternalLink, GitBranch, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/app/providers';

export interface GitHubRepositoryItem {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
  description: string | null;
  htmlUrl: string;
  installationId: number;
}

export interface RepoPickerProps {
  onSelectRepo: (repo: GitHubRepositoryItem) => void;
  isGuest: boolean;
  onOpenAuth: () => void;
  initialRepositories?: GitHubRepositoryItem[];
}

export function RepoPicker({
  onSelectRepo,
  isGuest,
  onOpenAuth,
  initialRepositories,
}: RepoPickerProps) {
  const { getToken } = useAuth();
  const [repositories, setRepositories] = useState<GitHubRepositoryItem[]>(initialRepositories || []);
  const [loading, setLoading] = useState<boolean>(!initialRepositories && !isGuest);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string>('ALL');
  const [, startTransition] = useTransition();

  // 150ms debounce for fuzzy search (D-11, UI-SPEC)
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setDebouncedQuery(searchQuery);
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchRepositories = async () => {
    if (isGuest) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/github/repositories', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication required to list private repositories');
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to fetch repositories (${res.status})`);
      }

      const data = await res.json();
      setRepositories(data.repositories || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load authorized repositories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialRepositories && !isGuest) {
      fetchRepositories();
    }
  }, [isGuest]);

  // Unique organizations list with counts
  const orgCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of repositories) {
      const org = r.owner?.login || 'other';
      counts.set(org, (counts.get(org) || 0) + 1);
    }
    return counts;
  }, [repositories]);

  // Filtered repositories based on debounced search and org pill
  const filteredRepos = useMemo(() => {
    return repositories.filter((repo) => {
      // Org filter
      if (selectedOrg !== 'ALL' && repo.owner?.login !== selectedOrg) {
        return false;
      }
      // Text search
      if (!debouncedQuery.trim()) {
        return true;
      }
      const q = debouncedQuery.toLowerCase();
      const matchName = repo.name?.toLowerCase().includes(q);
      const matchFull = repo.fullName?.toLowerCase().includes(q);
      const matchOwner = repo.owner?.login?.toLowerCase().includes(q);
      const matchDesc = repo.description?.toLowerCase().includes(q);
      return matchName || matchFull || matchOwner || matchDesc;
    });
  }, [repositories, debouncedQuery, selectedOrg]);

  // State: Guest Mode
  if (isGuest) {
    return (
      <div data-testid="repo-picker-guest" className="p-8 text-center space-y-4 border border-border bg-card/60">
        <div className="w-10 h-10 mx-auto border border-accent/40 bg-accent/10 flex items-center justify-center text-accent">
          <Lock className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Sign In to Access Private Repositories
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            You are browsing as an anonymous guest. Sign in with GitHub to view and index repositories from your authorized GitHub App installations.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAuth}
          data-testid="repo-picker-guest-auth-btn"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-background bg-accent hover:bg-accent/90 transition-colors uppercase tracking-wider"
        >
          <span>Sign in with GitHub</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // State: Loading
  if (loading) {
    return (
      <div data-testid="repo-picker-loading" className="space-y-2 py-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-14 bg-muted/40 animate-pulse border border-border/40 rounded flex items-center px-4 justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-muted rounded-sm" />
              <div className="space-y-1.5">
                <div className="w-36 h-3 bg-muted rounded" />
                <div className="w-20 h-2 bg-muted/60 rounded" />
              </div>
            </div>
            <div className="w-16 h-6 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  // State: Error
  if (error) {
    return (
      <div data-testid="repo-picker-error" className="p-6 border border-destructive/40 bg-destructive/10 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-destructive font-bold text-xs uppercase tracking-wider">
          <AlertTriangle className="w-4 h-4" />
          <span>Failed to load repositories</span>
        </div>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={fetchRepositories}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground border border-border bg-card hover:bg-muted/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check Again</span>
        </button>
      </div>
    );
  }

  // State: Authenticated with 0 repositories
  if (repositories.length === 0) {
    return (
      <div data-testid="repo-picker-empty" className="p-8 text-center space-y-4 border border-border bg-card/60">
        <div className="w-10 h-10 mx-auto border border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
          <GitBranch className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            No Repositories Found
          </h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            The Argon GitHub App is not installed on any repositories, or no repositories match your search filter.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <a
            href="https://github.com/apps/argon-knowledge/installations/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-background bg-accent hover:bg-accent/90 transition-colors uppercase tracking-wider"
          >
            <span>Install GitHub App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={fetchRepositories}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground border border-border bg-card hover:bg-muted/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Again</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="repo-picker" className="space-y-3 font-mono">
      {/* Search Bar */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter repositories by name or organization..."
          data-testid="repo-search-input"
          className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 font-mono transition-colors"
        />
      </div>

      {/* Organization Filter Strip (D-11) */}
      {orgCounts.size > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
          <button
            type="button"
            onClick={() => setSelectedOrg('ALL')}
            className={clsx(
              'px-2 py-0.5 border text-xs transition-colors shrink-0',
              selectedOrg === 'ALL'
                ? 'border-accent bg-accent/15 text-accent font-bold'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            All ({repositories.length})
          </button>
          {Array.from(orgCounts.entries()).map(([org, count]) => (
            <button
              key={org}
              type="button"
              onClick={() => setSelectedOrg(org)}
              className={clsx(
                'px-2 py-0.5 border text-xs transition-colors shrink-0',
                selectedOrg === org
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {org} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Repository Rows */}
      <div className="max-h-[380px] overflow-y-auto pr-1 space-y-1.5 divide-y divide-border/20">
        {filteredRepos.length === 0 ? (
          <div className="p-8 text-center space-y-2 border border-border/40 bg-card/40">
            <p className="text-xs text-muted-foreground">
              No repositories match &quot;{debouncedQuery}&quot;
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedOrg('ALL');
              }}
              className="px-2.5 py-1 text-xs text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors"
            >
              Clear Filter
            </button>
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const initials = (repo.owner?.login || repo.name || 'RP')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={repo.id}
                data-testid={`repo-row-${repo.id}`}
                className="flex items-center justify-between p-3 border border-border/60 bg-card hover:bg-muted/40 transition-colors gap-3"
              >
                {/* Leading: Avatar + Metadata */}
                <div className="flex items-center gap-3 min-w-0">
                  {repo.owner?.avatarUrl ? (
                    <img
                      src={repo.owner.avatarUrl}
                      alt={repo.owner.login}
                      className="w-6 h-6 rounded-sm border border-border shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-sm border border-border bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                      {initials}
                    </div>
                  )}

                  <div className="space-y-0.5 truncate">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold text-foreground truncate"
                        title={repo.fullName}
                      >
                        {repo.fullName}
                      </span>
                      {repo.defaultBranch && (
                        <span className="text-[10px] text-muted-foreground px-1 border border-border bg-muted/30 shrink-0">
                          {repo.defaultBranch}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-sm">
                        {repo.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Trailing: Visibility Badge + CTA */}
                <div className="flex items-center gap-2 shrink-0">
                  {repo.private ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/30 border border-amber-500/30 px-1.5 py-0.5 rounded-sm">
                      <Lock className="w-3 h-3" />
                      <span>Private</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded-sm">
                      <Globe className="w-3 h-3" />
                      <span>Public</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectRepo(repo)}
                    data-testid={`index-repo-button-${repo.id}`}
                    className="px-2.5 py-1 text-xs font-bold text-background bg-accent hover:bg-accent/90 transition-colors uppercase tracking-wider"
                  >
                    Index Repo
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
