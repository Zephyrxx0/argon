'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GitFork, ChevronDown, Plus, Check } from 'lucide-react';
import { IngestModal } from './ingest-modal';
import { clsx } from 'clsx';

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
    id: 'astro-rfc-showcase',
    name: 'Astro RFC Corpus',
    repoUrl: 'https://github.com/withastro/roadmap',
    nodeCount: 96,
  },
  {
    id: 'synthetic-demo',
    name: 'Instant Synthetic Graph',
    repoUrl: 'https://github.com/argon/synthetic-demo',
    nodeCount: 42,
  },
];

export interface WorkspaceSwitcherProps {
  workspaces?: Workspace[];
  currentWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
  onIngestSuccess?: (workspace: Workspace) => void;
  className?: string;
}

export function WorkspaceSwitcher({
  workspaces = SHOWCASE_WORKSPACES,
  currentWorkspaceId = 'ember-adr-showcase',
  onSelectWorkspace,
  onIngestSuccess,
  className,
}: WorkspaceSwitcherProps) {
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

  const handleIngestComplete = (newWorkspace: Workspace) => {
    onIngestSuccess?.(newWorkspace);
    onSelectWorkspace(newWorkspace.id);
  };

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
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => handleSelect(workspace.id)}
                    data-testid={`workspace-item-${workspace.id}`}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors',
                      isSelected
                        ? 'bg-accent/10 text-accent font-semibold'
                        : 'text-foreground hover:bg-muted/60 hover:text-accent'
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
                    {workspace.nodeCount && (
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {workspace.nodeCount}n
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

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
