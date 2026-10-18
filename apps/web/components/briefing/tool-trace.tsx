'use client';

import React from 'react';
import type { ToolSelectionSummary, ToolTraceEntry } from '@argon/agent';
import { clsx } from 'clsx';
import { Wrench } from 'lucide-react';

const STATUS_STYLE: Record<ToolTraceEntry['status'], string> = {
  ok: 'text-success',
  error: 'text-danger',
  rejected: 'text-warning',
  skipped: 'text-muted-foreground',
};

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
}

export interface ToolTracePanelProps {
  trace: ToolTraceEntry[];
  selection?: ToolSelectionSummary;
  className?: string;
}

/**
 * "Show the path behind the answer": every graph tool call that produced the briefing, in order,
 * who chose it (the fixed pipeline or the LLM planner), and what it returned.
 */
export function ToolTracePanel({ trace, selection, className }: ToolTracePanelProps) {
  const llmCalls = trace.filter((t) => t.source === 'llm' && t.status === 'ok').length;
  const pipelineCalls = trace.filter((t) => t.source === 'pipeline' && t.status === 'ok').length;

  return (
    <section
      id="sec-tool-trace"
      data-testid="tool-trace"
      className={clsx('space-y-4 scroll-mt-24', className)}
    >
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
          <Wrench className="w-4 h-4 text-accent" aria-hidden="true" />
          <span>07 // GRAPH TOOLS CALLED</span>
        </div>
        <span className="text-[11px] text-muted-foreground font-semibold" data-testid="tool-trace-counts">
          {pipelineCalls} PIPELINE · {llmCalls} LLM-SELECTED
        </span>
      </div>

      {selection && (
        <p
          data-testid="tool-selection-status"
          className={clsx(
            'text-[11px]',
            selection.status === 'failed' ? 'text-warning' : 'text-muted-foreground'
          )}
        >
          LLM tool selection: {selection.status}
          {selection.reason ? ` (${selection.reason})` : ''}
        </p>
      )}

      {trace.length === 0 ? (
        <div className="p-4 border border-border bg-muted/20 text-xs text-muted-foreground text-center">
          No tool calls recorded
        </div>
      ) : (
        <ol className="border border-border divide-y divide-border/60 bg-card/60">
          {trace.map((t, idx) => (
            <li
              key={`${idx}-${t.tool}`}
              data-testid="tool-trace-row"
              data-source={t.source}
              data-status={t.status}
              className="p-3 text-xs flex flex-wrap items-baseline gap-x-3 gap-y-1"
            >
              <span
                className={clsx(
                  'px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
                  t.source === 'llm'
                    ? 'border-accent/60 text-accent'
                    : 'border-border text-muted-foreground'
                )}
              >
                {t.source === 'llm' ? `LLM step ${t.step}` : 'pipeline'}
              </span>
              <span className="font-bold text-foreground">{t.tool}</span>
              <span className="text-muted-foreground break-all">{formatArgs(t.args)}</span>
              <span className={clsx('ml-auto font-semibold uppercase', STATUS_STYLE[t.status])}>
                {t.status}
                {t.status === 'ok' ? ` · ${t.rowCount} rows · ${t.durationMs}ms` : ''}
              </span>
              {t.note && <span className="basis-full text-[11px] text-muted-foreground">{t.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
