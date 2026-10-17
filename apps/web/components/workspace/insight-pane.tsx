'use client';

import React, { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { Network, FolderTree, GitCompare, Plug, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { McpSetupPanel } from '@/components/workspace/mcp-setup-panel';
import { GuidePanel } from '@/components/workspace/guide-panel';

// The Pierre components render into shadow roots and touch the DOM on mount: client-only.
const FileTreePanel = dynamic(
  () => import('@/components/files/file-tree-panel').then((m) => m.FileTreePanel),
  { ssr: false }
);
const DecisionDiffPanel = dynamic(
  () => import('@/components/diff/decision-diff-panel').then((m) => m.DecisionDiffPanel),
  { ssr: false }
);

export type InsightTab = 'graph' | 'files' | 'diff' | 'mcp' | 'guide';

const TABS: Array<{ id: InsightTab; label: string; Icon: typeof Network }> = [
  { id: 'graph', label: 'Graph', Icon: Network },
  { id: 'files', label: 'Files', Icon: FolderTree },
  { id: 'diff', label: 'Diff', Icon: GitCompare },
  { id: 'mcp', label: 'MCP', Icon: Plug },
  { id: 'guide', label: 'Guide', Icon: BookOpen },
];

export interface InsightPaneProps {
  workspaceId: string;
  /** The graph canvas. Kept mounted across tab switches so layout/selection survive. */
  graph: React.ReactNode;
  highlightComponents?: string[];
  citedDecisionIds?: string[];
  className?: string;
}

export function InsightPane({
  workspaceId,
  graph,
  highlightComponents,
  citedDecisionIds,
  className,
}: InsightPaneProps) {
  const uid = useId();
  const tabId = (id: InsightTab) => `${uid}-tab-${id}`;
  const panelId = (id: InsightTab) => `${uid}-panel-${id}`;
  const [tab, setTab] = useState<InsightTab>('graph');
  // Panels mount lazily on first visit, then stay mounted to keep scroll/selection state.
  const [visited, setVisited] = useState<Set<InsightTab>>(() => new Set(['graph']));

  const select = (next: InsightTab) => {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  return (
    <div className={clsx('flex h-full w-full flex-col bg-background', className)}>
      <div
        role="tablist"
        aria-label="Workspace views"
        className="flex shrink-0 border-b border-border"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            id={tabId(id)}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={panelId(id)}
            data-testid={`insight-tab-${id}`}
            onClick={() => select(id)}
            className={clsx(
              'flex items-center gap-2 border-r border-border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors',
              tab === id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          role="tabpanel"
          id={panelId('graph')}
          aria-labelledby={tabId('graph')}
          className={clsx('absolute inset-0', tab === 'graph' ? 'block' : 'hidden')}
        >
          {graph}
        </div>

        {visited.has('files') && (
          <div
            role="tabpanel"
            id={panelId('files')}
            aria-labelledby={tabId('files')}
            className={clsx('absolute inset-0', tab === 'files' ? 'block' : 'hidden')}
          >
            <FileTreePanel workspaceId={workspaceId} highlightComponents={highlightComponents} />
          </div>
        )}

        {visited.has('diff') && (
          <div
            role="tabpanel"
            id={panelId('diff')}
            aria-labelledby={tabId('diff')}
            className={clsx('absolute inset-0', tab === 'diff' ? 'block' : 'hidden')}
          >
            <DecisionDiffPanel workspaceId={workspaceId} citedDecisionIds={citedDecisionIds} />
          </div>
        )}

        {visited.has('mcp') && (
          <div
            role="tabpanel"
            id={panelId('mcp')}
            aria-labelledby={tabId('mcp')}
            className={clsx('absolute inset-0', tab === 'mcp' ? 'block' : 'hidden')}
          >
            <McpSetupPanel workspaceId={workspaceId} />
          </div>
        )}

        {visited.has('guide') && (
          <div
            role="tabpanel"
            id={panelId('guide')}
            aria-labelledby={tabId('guide')}
            className={clsx('absolute inset-0', tab === 'guide' ? 'block' : 'hidden')}
          >
            <GuidePanel />
          </div>
        )}
      </div>
    </div>
  );
}
