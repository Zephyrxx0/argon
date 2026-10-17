'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileTree, useFileTree } from '@pierre/trees/react';
import type { GitStatusEntry } from '@pierre/trees';
import { useAuth } from '@/app/providers';
import { fetchWorkspaceResource } from '@/lib/workspace-client';
import type {
  WorkspaceFile,
  WorkspaceFilesResponse,
} from '@/app/api/workspace/[id]/files/route';

export interface FileTreePanelProps {
  workspaceId: string;
  /** Component names from the active briefing's blast radius — their files get marked. */
  highlightComponents?: string[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready'; files: WorkspaceFile[]; truncated: boolean };

// Monochrome skin for the tree (it lives in a shadow root, so it is styled via CSS variables).
const TREE_STYLE = {
  height: '100%',
  '--trees-bg-override': '#000000',
  '--trees-bg-muted-override': '#0c0c0c',
  '--trees-fg-override': '#ffffff',
  '--trees-fg-muted-override': '#8f8f8f',
  '--trees-border-color-override': '#2b2b2b',
  '--trees-accent-override': '#ffffff',
  '--trees-selected-bg-override': '#ffffff',
  '--trees-selected-fg-override': '#000000',
  '--trees-search-bg-override': '#0c0c0c',
  '--trees-search-fg-override': '#ffffff',
  '--trees-input-bg-override': '#0c0c0c',
  '--trees-border-radius-override': '0px',
  '--trees-font-family-override':
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  '--trees-font-size-override': '12px',
  '--trees-git-modified-color-override': '#ffffff',
  '--trees-status-modified-override': '#ffffff',
} as React.CSSProperties;

export function FileTreePanel({ workspaceId, highlightComponents = [] }: FileTreePanelProps) {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const { model } = useFileTree({
    paths: [],
    initialExpansion: 'open',
    search: true,
    density: 'compact',
    icons: { set: 'minimal', colored: false },
    onSelectionChange: (paths) => setSelectedPath(paths[0] ?? null),
  });

  // Load the workspace's file inventory from the graph
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    setSelectedPath(null);

    (async () => {
      const token = await getToken().catch(() => null);
      const result = await fetchWorkspaceResource<WorkspaceFilesResponse>(
        workspaceId,
        'files',
        token,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (result.ok) {
        setState({ status: 'ready', files: result.data.files, truncated: result.data.truncated });
      } else {
        setState({ status: 'error', message: result.message, code: result.status });
      }
    })();

    return () => controller.abort();
    // getToken identity changes with the cached token; the workspace is the real trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const files = state.status === 'ready' ? state.files : null;
  const byPath = useMemo(() => new Map((files ?? []).map((f) => [f.path, f])), [files]);

  useEffect(() => {
    if (files) model.resetPaths(files.map((f) => f.path));
  }, [files, model]);

  const highlighted = useMemo(() => {
    const set = new Set(highlightComponents);
    return (files ?? []).filter((f) => f.component && set.has(f.component));
  }, [files, highlightComponents]);

  useEffect(() => {
    const entries: GitStatusEntry[] = highlighted.map((f) => ({
      path: f.path,
      status: 'modified',
    }));
    model.setGitStatus(entries);
  }, [highlighted, model]);

  const selected = selectedPath ? byPath.get(selectedPath) : undefined;
  const selectedInBlast = selected ? highlighted.some((f) => f.path === selected.path) : false;

  return (
    <div data-testid="file-tree-panel" className="flex h-full min-h-0 flex-col bg-background font-mono">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{workspaceId}</span>
        <span>
          {state.status === 'ready' ? `${state.files.length} files` : '—'}
          {highlighted.length > 0 && (
            <span className="ml-2 text-foreground">&middot; {highlighted.length} in blast radius</span>
          )}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {state.status === 'loading' && (
          <p data-testid="file-tree-loading" className="p-4 text-xs text-muted-foreground">
            Reading file graph&hellip;
          </p>
        )}

        {state.status === 'error' && (
          <div
            role="alert"
            data-testid="file-tree-error"
            className="m-4 border border-danger p-4 text-xs text-danger"
          >
            <p className="font-bold uppercase tracking-wider">
              {state.code === 503 ? 'No graph, no answer' : 'File tree unavailable'}
            </p>
            <p className="mt-2 text-danger/80">{state.message}</p>
          </div>
        )}

        {state.status === 'ready' && state.files.length === 0 && (
          <p data-testid="file-tree-empty" className="p-4 text-xs text-muted-foreground">
            No files indexed for this workspace.
          </p>
        )}

        {state.status === 'ready' && state.files.length > 0 && (
          <FileTree model={model} style={TREE_STYLE} aria-label="Workspace files" />
        )}
      </div>

      <div
        data-testid="file-tree-detail"
        className="border-t border-border px-3 py-2 text-[11px] leading-relaxed"
      >
        {selected ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground uppercase">path</dt>
            <dd className="truncate text-foreground">{selected.path}</dd>
            <dt className="text-muted-foreground uppercase">component</dt>
            <dd className="text-foreground">{selected.component ?? 'unassigned'}</dd>
            <dt className="text-muted-foreground uppercase">prs</dt>
            <dd className="text-foreground">{selected.touches} touching</dd>
            {selectedInBlast && (
              <>
                <dt className="text-muted-foreground uppercase">briefing</dt>
                <dd className="text-foreground">in blast radius</dd>
              </>
            )}
          </dl>
        ) : (
          <span className="text-muted-foreground">
            Select a file to see its component and PR history.
            {state.status === 'ready' && state.truncated && ' (list truncated)'}
          </span>
        )}
      </div>
    </div>
  );
}
