'use client';

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search, Sparkles, FileCode, Clock, Box, X } from 'lucide-react';
import type { PaletteEntity, ScenarioPreset } from '@/lib/scenarios';

export interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectQuery: (query: string) => void;
  currentWorkspace?: string;
  /** Suggestions for the active workspace (derived from its graph). */
  scenarios?: ScenarioPreset[];
  entities?: PaletteEntity[];
  curated?: boolean;
}

const RECENT_QUERIES_KEY = 'argon_recent_queries_v1';

export function CommandDialog({
  open,
  onOpenChange,
  onSelectQuery,
  scenarios = [],
  entities = [],
  curated = false,
}: CommandDialogProps) {
  const [search, setSearch] = useState('');
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Tell the rest of the page the palette is open, so the graph canvas (and its floating HUD /
  // inspector) can go inert and blurred behind the overlay.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.commandPaletteOpen = open ? 'true' : 'false';
    return () => {
      delete document.body.dataset.commandPaletteOpen;
    };
  }, [open]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_QUERIES_KEY);
      if (stored) {
        setRecentQueries(JSON.parse(stored).slice(0, 5));
      }
    } catch {
      // localStorage may be disabled
    }
  }, [open]);

  const saveRecentQuery = (query: string) => {
    try {
      const updated = [query, ...recentQueries.filter((q) => q !== query)].slice(0, 5);
      setRecentQueries(updated);
      localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  const handleSelect = (query: string) => {
    saveRecentQuery(query);
    onSelectQuery(query);
    onOpenChange(false);
  };

  // Keyboard listener for Escape and Cmd+K handled by parent or dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background/80 backdrop-blur-sm font-mono animate-in fade-in duration-150"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-4xl max-h-[65vh] flex min-h-0 flex-col border border-border bg-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="command-dialog"
      >
        <Command
          filter={(value, search) => {
            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
            return 0;
          }}
          className="w-full flex min-h-0 flex-1 flex-col"
        >
          {/* Header Search Input */}
          <div className="flex items-center px-4 border-b border-border bg-muted/40">
            <Search className="w-4 h-4 text-accent shrink-0 mr-3" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search scope (e.g. billing/retry.ts, auth, why does legacy-sync exist?)..."
              className="w-full py-3.5 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus-visible:outline-none border-none font-mono tracking-tight"
              autoFocus
              data-testid="command-palette-input"
              data-command-input=""
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] text-muted-foreground border border-border bg-background ml-2">
              ESC
            </kbd>
          </div>

          {/* Suggestion List */}
          <Command.List
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2 divide-y divide-border/40"
            data-testid="command-palette-list"
          >
            <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
              No matching files, components, or scenarios found.
            </Command.Empty>

            {/* Scenarios for this workspace */}
            {scenarios.length > 0 && (
            <Command.Group
              heading={curated ? 'CURATED SCENARIOS' : 'SUGGESTED SCENARIOS'}
              className="text-[11px] font-semibold text-muted-foreground uppercase px-2 pt-2"
            >
              {scenarios.map((scenario) => (
                <Command.Item
                  key={scenario.id}
                  value={`${scenario.title} ${scenario.query} ${scenario.badge}`}
                  onSelect={() => handleSelect(scenario.query)}
                  data-testid={`command-item-${scenario.id}`}
                  className="flex items-center justify-between p-2 my-1 text-xs cursor-pointer text-foreground hover:bg-accent/10 hover:text-accent border border-transparent hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-medium">{scenario.title}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {scenario.badge}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
            )}

            {/* Recent Queries (if any) */}
            {recentQueries.length > 0 && (
              <Command.Group
                heading="RECENT QUERIES"
                className="text-[11px] font-semibold text-muted-foreground uppercase px-2 pt-2"
              >
                {recentQueries.map((query, index) => (
                  <Command.Item
                    key={`recent-${index}`}
                    value={`recent ${query}`}
                    onSelect={() => handleSelect(query)}
                    className="flex items-center justify-between p-2 my-1 text-xs cursor-pointer text-foreground hover:bg-accent/10 hover:text-accent border border-transparent hover:border-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{query}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">HISTORY</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Files & Components of this workspace */}
            {entities.length > 0 && (
            <Command.Group
              heading="FILES & COMPONENTS"
              className="text-[11px] font-semibold text-muted-foreground uppercase px-2 pt-2"
            >
              {entities.map((entity, idx) => (
                <Command.Item
                  key={`entity-${idx}`}
                  value={`${entity.label} ${entity.desc}`}
                  onSelect={() => handleSelect(entity.query)}
                  className="flex items-center justify-between p-2 my-1 text-xs cursor-pointer text-foreground hover:bg-accent/10 hover:text-accent border border-transparent hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {entity.type === 'file' ? (
                      <FileCode className="w-3.5 h-3.5 text-foreground shrink-0" />
                    ) : (
                      <Box className="w-3.5 h-3.5 text-accent shrink-0" />
                    )}
                    <span className="font-medium">{entity.label}</span>
                    <span className="text-[11px] text-muted-foreground hidden sm:inline">
                      — {entity.desc}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {entity.type}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
            )}
          </Command.List>

          {/* Footer Navigation Hints */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground select-none">
            <div className="flex items-center gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>ESC Close</span>
            </div>
            <span className="text-accent font-semibold tracking-wider uppercase">ARGON SCOPE PALETTE</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
