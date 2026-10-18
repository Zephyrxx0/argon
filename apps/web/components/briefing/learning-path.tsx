'use client';

import React from 'react';
import type { LearningPath, LearningPathHop } from '@argon/agent';
import { clsx } from 'clsx';
import { ArrowDown, Compass, Crosshair, Flag, MapPin, ShieldCheck, Users } from 'lucide-react';
import { useGraphSync } from '@/lib/graph-sync';

const ROLE_LABEL: Record<LearningPathHop['role'], string> = {
  start: 'Start here',
  step: 'Then',
  goal: 'Goal',
};

function HopCard({ hop, onFocus }: { hop: LearningPathHop; onFocus: (component: string) => void }) {
  const RoleIcon = hop.role === 'start' ? MapPin : hop.role === 'goal' ? Flag : null;
  return (
    <li
      data-testid="learning-path-hop"
      data-index={hop.index}
      data-role={hop.role}
      className="border border-border bg-card p-3 font-mono space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center border border-accent/60 text-[10px] font-bold text-accent"
        >
          {hop.index + 1}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {RoleIcon && <RoleIcon className="h-3 w-3" aria-hidden="true" />}
          {ROLE_LABEL[hop.role]}
        </span>
        <span data-testid="learning-path-component" className="text-sm font-bold text-foreground">
          {hop.component}
        </span>
        {hop.pageRank !== null && (
          <span
            data-testid="learning-path-pagerank"
            title="PageRank centrality of this component over the dependency graph"
            className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            PageRank {hop.pageRank.toFixed(3)}
          </span>
        )}
        <button
          type="button"
          onClick={() => onFocus(hop.component)}
          data-testid="learning-path-focus"
          aria-label={`Show ${hop.component} on the graph`}
          className="ml-auto inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
        >
          <Crosshair className="h-3 w-3" aria-hidden="true" />
          Show on graph
        </button>
      </div>

      {hop.decisions.length > 0 && (
        <ul data-testid="learning-path-decisions" className="space-y-1">
          {hop.decisions.map((d) => (
            <li key={d.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
              <span>
                <code className="text-foreground">#{d.id}</code>
                {d.title ? ` ${d.title}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hop.owners.length > 0 && (
        <p data-testid="learning-path-owners" className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Users className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Owner of record:{' '}
            <span className="text-foreground">{hop.owners.map((o) => o.name ?? o.id).join(', ')}</span>
          </span>
        </p>
      )}

      {hop.annotated && hop.decisions.length === 0 && hop.owners.length === 0 && (
        <p className="text-[11px] text-muted-foreground/70">No decision or owner of record in the graph for this component.</p>
      )}
      {!hop.annotated && (
        <p data-testid="learning-path-unannotated" className="text-[11px] text-muted-foreground/70">
          Decisions and owners could not be looked up for this step.
        </p>
      )}
    </li>
  );
}

export interface LearningPathViewProps {
  paths: LearningPath[];
  className?: string;
}

/**
 * The shortest dependency walk between two components (FalkorDB `algo.SPpaths`) as an ordered
 * learning path: start here, then each component the previous one depends on, with the decisions in
 * force and the owner of record of every step. All of it comes from the graph.
 */
export function LearningPathView({ paths, className }: LearningPathViewProps) {
  const { focusNode } = useGraphSync();
  if (paths.length === 0) return null;

  return (
    <section id="sec-learning-path" data-testid="learning-path" className={clsx('space-y-4 scroll-mt-24', className)}>
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
          <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>06 // LEARNING PATH</span>
        </div>
        <span className="text-[11px] text-muted-foreground font-semibold">
          {paths.length} {paths.length === 1 ? 'PATH' : 'PATHS'}
        </span>
      </div>

      {paths.map((path) => (
        <div key={`${path.source}->${path.target}`} data-testid="learning-path-card" className="space-y-3">
          <h4 className="text-xs font-bold text-foreground">
            {path.source} <span className="text-muted-foreground">→</span> {path.target}
            {path.found && (
              <span className="ml-2 font-normal text-muted-foreground">
                {path.length === 0 ? 'same component' : `${path.length} ${path.length === 1 ? 'hop' : 'hops'}`}
              </span>
            )}
          </h4>

          {!path.found ? (
            <div
              data-testid="learning-path-empty"
              className="border border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground"
            >
              No dependency path from {path.source} to {path.target} in the graph (searched along DEPENDS_ON from{' '}
              {path.source}).
            </div>
          ) : (
            <ol className="space-y-1" aria-label={`Learning path from ${path.source} to ${path.target}`}>
              {path.hops.map((hop, i) => (
                <React.Fragment key={`${hop.index}-${hop.component}`}>
                  {i > 0 && (
                    <li aria-hidden="true" className="flex items-center gap-1.5 pl-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      <ArrowDown className="h-3 w-3" />
                      <span>{path.hops[i - 1]!.component} depends on</span>
                    </li>
                  )}
                  <HopCard hop={hop} onFocus={focusNode} />
                </React.Fragment>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}
