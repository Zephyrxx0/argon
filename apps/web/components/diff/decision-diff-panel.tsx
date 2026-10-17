'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import { clsx } from 'clsx';
import { useAuth } from '@/app/providers';
import { fetchWorkspaceResource } from '@/lib/workspace-client';
import { buildDecisionDiffInput, findRelevantSupersession } from '@/lib/decision-diff';
import type {
  Supersession,
  SupersessionsResponse,
} from '@/app/api/workspace/[id]/supersessions/route';

export interface DecisionDiffPanelProps {
  workspaceId: string;
  /** Decision ids cited by the active briefing; the matching supersession is preselected. */
  citedDecisionIds?: string[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready'; pairs: Supersession[] };

// Pure-black canvas, mono type, square corners. Add/remove tints stay: they are state.
const DIFF_CSS = `
  :host, pre, [data-diffs-header] { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
`;

export function DecisionDiffPanel({ workspaceId, citedDecisionIds = [] }: DecisionDiffPanelProps) {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('unified');

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    (async () => {
      const token = await getToken().catch(() => null);
      const result = await fetchWorkspaceResource<SupersessionsResponse>(
        workspaceId,
        'supersessions',
        token,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (result.ok) {
        setState({ status: 'ready', pairs: result.data.supersessions });
      } else {
        setState({ status: 'error', message: result.message, code: result.status });
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const pairs = state.status === 'ready' ? state.pairs : null;
  const citedKey = citedDecisionIds.join('|');

  // Jump to the supersession the briefing is about whenever it changes
  useEffect(() => {
    if (!pairs) return;
    const idx = findRelevantSupersession(pairs, citedKey ? citedKey.split('|') : []);
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [pairs, citedKey]);

  const selected = pairs?.[selectedIndex];
  const diffInput = useMemo(() => (selected ? buildDecisionDiffInput(selected) : null), [selected]);

  return (
    <div data-testid="decision-diff-panel" className="flex h-full min-h-0 flex-col bg-background font-mono">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>Decision supersessions</span>
        <div className="flex gap-1" role="group" aria-label="Diff layout">
          {(['unified', 'split'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDiffStyle(mode)}
              aria-pressed={diffStyle === mode}
              data-testid={`diff-style-${mode}`}
              className={clsx(
                'border px-2 py-0.5 uppercase tracking-wider transition-colors',
                diffStyle === mode
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <p data-testid="decision-diff-loading" className="p-4 text-xs text-muted-foreground">
          Reading supersession edges&hellip;
        </p>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          data-testid="decision-diff-error"
          className="m-4 border border-danger p-4 text-xs text-danger"
        >
          <p className="font-bold uppercase tracking-wider">
            {state.code === 503 ? 'No graph, no answer' : 'Diff unavailable'}
          </p>
          <p className="mt-2 text-danger/80">{state.message}</p>
        </div>
      )}

      {pairs && pairs.length === 0 && (
        <p data-testid="decision-diff-empty" className="p-4 text-xs text-muted-foreground">
          No decision in this workspace has been superseded yet.
        </p>
      )}

      {pairs && pairs.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ul
            aria-label="Superseded decisions"
            className="max-h-[34%] shrink-0 overflow-y-auto border-b border-border"
          >
            {pairs.map((pair, i) => (
              <li key={`${pair.previous.id}->${pair.current.id}`}>
                <button
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  aria-current={i === selectedIndex}
                  data-testid={`supersession-${pair.current.id}`}
                  className={clsx(
                    'flex w-full items-baseline gap-3 border-b border-border/60 px-3 py-1.5 text-left text-[11px] transition-colors',
                    i === selectedIndex
                      ? 'bg-foreground text-background'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span className="shrink-0 font-bold">
                    {pair.previous.id} &rarr; {pair.current.id}
                  </span>
                  <span
                    className={clsx(
                      'truncate',
                      i === selectedIndex ? 'text-background/70' : 'text-muted-foreground'
                    )}
                  >
                    {pair.current.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-h-0 flex-1 overflow-auto" data-testid="decision-diff-view">
            {diffInput && (
              <MultiFileDiff
                oldFile={diffInput.oldFile}
                newFile={diffInput.newFile}
                options={{
                  theme: 'vitesse-black',
                  themeType: 'dark',
                  diffStyle,
                  overflow: 'wrap',
                  disableFileHeader: false,
                  unsafeCSS: DIFF_CSS,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
