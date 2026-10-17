'use client';

import React, { useState, useEffect } from 'react';
import { Search, Loader2, AlertCircle, CornerDownLeft } from 'lucide-react';
import { CommandDialog } from './command-dialog';
import type { WorkspaceSuggestions } from '@/lib/scenarios';
import { clsx } from 'clsx';

export interface CommandBarProps {
  value?: string;
  isLoading?: boolean;
  error?: string | null;
  onSubmit: (query: string) => void;
  /** Palette suggestions for the active workspace. */
  suggestions?: WorkspaceSuggestions;
  className?: string;
}

const DEFAULT_PLACEHOLDER = 'Search scope (e.g. billing/retry.ts, auth, why does legacy-sync exist?)...';

/** Example text drawn from the active workspace so it never suggests files that are not there. */
export function placeholderFor(suggestions?: WorkspaceSuggestions): string {
  if (!suggestions || suggestions.curated) return DEFAULT_PLACEHOLDER;
  const examples = suggestions.entities.slice(0, 2).map((e) => e.query);
  return examples.length > 0
    ? `Search scope (e.g. ${examples.join(', ')})...`
    : 'Search scope: a file path, a component name, or a question...';
}

export function CommandBar({
  value = '',
  isLoading = false,
  error = null,
  onSubmit,
  suggestions,
  className,
}: CommandBarProps) {
  const [query, setQuery] = useState(value);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.userAgent));
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }
    }
  };

  const handlePaletteSelect = (selectedQuery: string) => {
    setQuery(selectedQuery);
    onSubmit(selectedQuery);
  };

  return (
    <>
      <div className={clsx('relative w-full font-mono', className)}>
        <div
          className={clsx(
            'flex items-center w-full px-3 py-1.5 border transition-all duration-150',
            isLoading
              ? 'border-accent bg-accent/5'
              : error
              ? 'border-danger bg-danger/5'
              : 'border-border bg-muted/60 hover:border-border/80 focus-within:border-accent focus-within:bg-card'
          )}
        >
          {/* Status or Search Icon */}
          <div className="shrink-0 mr-2.5">
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
            ) : error ? (
              <AlertCircle className="w-4 h-4 text-danger" />
            ) : (
              <Search className="w-4 h-4 text-muted-foreground group-focus-within:text-accent" />
            )}
          </div>

          {/* Search Input Field */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={
              isLoading
                ? 'COMPUTING SCOPE EMBEDDING...'
                : placeholderFor(suggestions)
            }
            data-testid="command-bar-input"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono tracking-tight"
          />

          {/* Right actions & shortcuts */}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {query.length > 30 && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {query.length}c
              </span>
            )}

            {query.trim().length > 0 && !isLoading && (
              <button
                type="button"
                onClick={() => onSubmit(query.trim())}
                data-testid="command-bar-submit"
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors"
              >
                <span>RUN</span>
                <CornerDownLeft className="w-2.5 h-2.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              data-testid="command-palette-trigger"
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border bg-card hover:border-accent hover:text-accent transition-colors cursor-pointer select-none"
              title="Open Command Palette"
            >
              <span>{isMac ? '⌘K' : 'Ctrl+K'}</span>
            </button>
          </div>
        </div>

        {/* Error Tooltip Banner if active */}
        {error && (
          <div className="absolute top-full left-0 mt-1 z-30 px-2 py-1 text-[11px] text-danger border border-danger/40 bg-card shadow-lg flex items-center gap-1.5 animate-in fade-in duration-150">
            <AlertCircle className="w-3 h-3 text-danger shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Centered Cmd+K Palette Modal */}
      <CommandDialog
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        onSelectQuery={handlePaletteSelect}
        scenarios={suggestions?.scenarios}
        entities={suggestions?.entities}
        curated={suggestions?.curated}
      />
    </>
  );
}

