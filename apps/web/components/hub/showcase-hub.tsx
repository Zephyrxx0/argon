'use client';

import React from 'react';
import { Sparkles, ArrowRight, ShieldAlert, GitFork, BookOpen, Layers } from 'lucide-react';
import { clsx } from 'clsx';

import { SCENARIO_PRESETS, type ScenarioPreset } from '@/lib/scenarios';

export { SCENARIO_PRESETS };
export type { ScenarioPreset };

export interface ShowcaseHubProps {
  onSelectScenario?: (query: string, scenarioId?: string) => void;
  /** Scenarios for the active workspace. Defaults to the curated demo trio. */
  scenarios?: ScenarioPreset[];
  /** `curated` = hand-written for this workspace; otherwise derived from its graph. */
  curated?: boolean;
  workspaceId?: string;
  /** While the workspace graph is still being read there is nothing to suggest yet. */
  loading?: boolean;
  className?: string;
}

export function ShowcaseHub({
  onSelectScenario,
  scenarios = SCENARIO_PRESETS,
  curated = true,
  workspaceId,
  loading = false,
  className,
}: ShowcaseHubProps) {
  const getIcon = (name: ScenarioPreset['iconName']) => {
    switch (name) {
      case 'git-fork':
        return <GitFork className="w-4 h-4" />;
      case 'layers':
        return <Layers className="w-4 h-4" />;
      case 'book-open':
        return <BookOpen className="w-4 h-4" />;
    }
  };

  return (
    <div className={clsx('flex flex-col p-6 sm:p-8 font-mono max-w-4xl mx-auto space-y-6', className)}>
      {/* Header & Copywriting Contract Empty State */}
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-semibold text-accent border border-border bg-card">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-accent" />
          <span className="tracking-widest uppercase">ARGON // EVIDENCE ENGINE</span>
        </div>

        <h1 className="text-2xl sm:text-[28px] font-black text-foreground tracking-tight leading-[1.2]">
          No Architectural Briefing Generated
        </h1>

        <p className="text-sm text-muted-foreground leading-[1.5]">
          Enter a target file path, component name, or task in the command bar above, or select a showcase scenario to compute evidence-backed graph claims.
        </p>
      </div>

      {/* Preset Scenario Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest font-semibold">
          <span>{curated ? 'CURATED SHOWCASE SCENARIOS' : 'SUGGESTED FOR THIS WORKSPACE'}</span>
          {workspaceId && <span className="truncate max-w-[50%]">{workspaceId}</span>}
        </div>

        {loading && (
          <p data-testid="scenarios-loading" className="text-xs text-muted-foreground">
            Reading this workspace&rsquo;s graph for suggestions&hellip;
          </p>
        )}
        {!loading && scenarios.length === 0 && (
          <p data-testid="scenarios-empty" className="text-xs text-muted-foreground">
            Nothing to suggest yet: no components or files are indexed for this workspace. Type a file or component
            name in the command bar.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelectScenario?.(scenario.query, scenario.id)}
              data-testid={`scenario-card-${scenario.id}`}
              className="group text-left border border-border bg-card p-4 sm:p-5 transition-all hover:border-accent flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase border bg-background/60',
                      scenario.accentColor
                    )}
                  >
                    {getIcon(scenario.iconName)}
                    {scenario.badge}
                  </span>
                  <span className="text-xs text-muted-foreground group-hover:text-accent flex items-center gap-1 transition-colors">
                    <span>RUN SCENARIO</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>

                <div className="text-base font-bold text-foreground group-hover:text-accent transition-colors pt-1">
                  {scenario.title}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {scenario.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="text-muted-foreground/80">Input query:</span>
                <code className="text-foreground/90 bg-muted px-1.5 py-0.5 rounded-none border border-border">
                  &quot;{scenario.query}&quot;
                </code>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Philosophy Callout Footer */}
      <div className="border border-border/80 bg-muted/20 p-4 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-semibold text-foreground uppercase tracking-wider">
            &ldquo;No graph, no answer&rdquo; verification guarantee
          </div>
          <p className="text-muted-foreground">
            Argon never outputs unproven assertions. Every claim in a briefing is linked to exact node IDs (#id) verified against FalkorDB GraphBLAS traversals.
          </p>
        </div>
      </div>
    </div>
  );
}

