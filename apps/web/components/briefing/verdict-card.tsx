'use client';

import React from 'react';
import type { Verdict } from '@argon/agent';
import { clsx } from 'clsx';
import { ShieldCheck, ShieldAlert, OctagonAlert, Crosshair } from 'lucide-react';
import { useGraphSync } from '@/lib/graph-sync';

const LEVEL_STYLE = {
  PROCEED: {
    box: 'border-success/60 bg-success/10',
    text: 'text-success',
    Icon: ShieldCheck,
    label: 'Proceed',
  },
  REVIEW: {
    box: 'border-warning/70 bg-warning/10',
    text: 'text-warning',
    Icon: ShieldAlert,
    label: 'Review first',
  },
  HOLD: {
    box: 'border-danger/70 bg-danger/10',
    text: 'text-danger',
    Icon: OctagonAlert,
    label: 'Hold',
  },
} as const;

const SEVERITY_TEXT = {
  info: 'text-muted-foreground',
  review: 'text-warning',
  hold: 'text-danger',
} as const;

const MAX_CHIPS = 6;

export interface VerdictCardProps {
  verdict: Verdict;
  className?: string;
}

/**
 * Graph-derived PROCEED / REVIEW / HOLD verdict. It is computed deterministically from graph
 * facts (reverts, superseded precedents, PageRank, blast radius), never by the LLM, and every
 * reason lists the graph nodes it rests on.
 */
export function VerdictCard({ verdict, className }: VerdictCardProps) {
  const style = LEVEL_STYLE[verdict.level] ?? LEVEL_STYLE.REVIEW;
  const { Icon } = style;
  // Same focus mechanism the citation chips use: the canvas lights up the cited nodes and their
  // edges. Ids that are not drawn on the canvas (e.g. a revert PR) are ignored there.
  const { focusNode, focusNodes } = useGraphSync();

  return (
    <section
      data-testid="verdict-card"
      data-verdict={verdict.level}
      aria-label={`Graph verdict: ${verdict.level}`}
      className={clsx('border p-4 space-y-3 font-mono', style.box, className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={clsx('flex items-center gap-2 text-xs font-black uppercase tracking-wider', style.text)}>
          <Icon className="w-4 h-4" aria-hidden="true" />
          <span data-testid="verdict-level">{verdict.level}</span>
          <span className="text-foreground/80 font-bold normal-case tracking-normal">· {style.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Computed from the graph, not generated
        </span>
      </div>

      <p className="text-xs text-foreground/90 leading-relaxed">{verdict.summary}</p>

      {verdict.reasons.length > 0 && (
        <ul className="space-y-2 pt-2 border-t border-border/60" data-testid="verdict-reasons">
          {verdict.reasons.map((reason) => (
            <li key={reason.rule} className="text-xs leading-relaxed">
              <span className={clsx('font-bold uppercase tracking-wider mr-2', SEVERITY_TEXT[reason.severity])}>
                {reason.rule}
              </span>
              <span className="text-muted-foreground">{reason.detail}</span>
              {reason.citedNodeIds.length > 0 && (
                <span
                  data-testid="verdict-reason-nodes"
                  className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80"
                >
                  <span>graph nodes:</span>
                  {reason.citedNodeIds.slice(0, MAX_CHIPS).map((id) => (
                    <button
                      key={id}
                      type="button"
                      data-testid="verdict-node-chip"
                      onClick={() => focusNode(id)}
                      title={`Show ${id} on the graph`}
                      className="border border-border bg-background/50 px-1.5 py-0.5 text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
                    >
                      {id}
                    </button>
                  ))}
                  {reason.citedNodeIds.length > MAX_CHIPS && (
                    <span>+{reason.citedNodeIds.length - MAX_CHIPS} more</span>
                  )}
                  <button
                    type="button"
                    data-testid="verdict-reason-focus"
                    onClick={() => focusNodes(reason.citedNodeIds)}
                    aria-label={`Highlight the ${reason.citedNodeIds.length} graph node${reason.citedNodeIds.length === 1 ? '' : 's'} behind ${reason.rule} on the graph`}
                    className="ml-auto inline-flex items-center gap-1 border border-border px-1.5 py-0.5 font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
                  >
                    <Crosshair className="h-3 w-3" aria-hidden="true" />
                    Show on graph
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
