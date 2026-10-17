'use client';

import React from 'react';
import { BookOpen, Command, GitFork, ShieldCheck, Wrench } from 'lucide-react';
import { clsx } from 'clsx';

export interface GuidePanelProps {
  className?: string;
}

interface GuideStep {
  Icon: typeof Command;
  title: string;
  body: React.ReactNode;
}

const STEPS: GuideStep[] = [
  {
    Icon: GitFork,
    title: '1 // Pick a workspace',
    body: (
      <>
        Use the workspace switcher in the header to choose a graph. <strong>synthetic-demo</strong> is
        the guided tour; <strong>argon-dogfood</strong> and <strong>ember-adr-showcase</strong> are
        larger real/mirrored corpora. Sign in with GitHub to ingest and analyze your own repository.
      </>
    ),
  },
  {
    Icon: Command,
    title: '2 // Ask a question',
    body: (
      <>
        Type into the command bar (or press <kbd className="border border-border px-1">⌘K</kbd> /{' '}
        <kbd className="border border-border px-1">Ctrl+K</kbd>) for the palette. Ask in plain language
        — a file path (<code>billing/retry.ts</code>), a component name (<code>auth</code>), or a
        question (<code>why does legacy-sync exist?</code>). The question is embedded and matched against
        the graph; the palette dropdown itself only filters the listed suggestions by text.
      </>
    ),
  },
  {
    Icon: ShieldCheck,
    title: '3 // Read the briefing',
    body: (
      <>
        The left panel streams a cited briefing: a <strong>verdict</strong> (PROCEED / REVIEW / HOLD,
        computed from the graph, not the model), a summary, blast radius, owners, decisions in force,
        and precedents. Every claim cites a graph node; uncited claims are stripped, and with zero
        verified citations Argon refuses — <em>&ldquo;no graph, no answer.&rdquo;</em>
      </>
    ),
  },
  {
    Icon: Wrench,
    title: '4 // Inspect the evidence',
    body: (
      <>
        This right panel has tabs: <strong>Graph</strong> (the cited sub-graph, with a Components ↔ Files
        toggle), <strong>Files</strong> (the repository tree), <strong>Diff</strong> (decision supersession
        diffs), and under the briefing a <strong>Graph tools called</strong> trace showing every query
        that produced the answer and who chose it (fixed pipeline vs. the LLM planner).
      </>
    ),
  },
  {
    Icon: BookOpen,
    title: '5 // Take it to your editor',
    body: (
      <>
        Open the <strong>MCP</strong> tab for step-by-step setup to call the same graph tools from Claude
        Code, Cursor, Codex, Gemini CLI, OpenCode, Windsurf and other MCP clients.
      </>
    ),
  },
];

/**
 * A brief how-to-use-the-app walkthrough, shown as a workspace tab. Intentionally short:
 * five steps that mirror the real flow (workspace → question → briefing → evidence → MCP).
 */
export function GuidePanel({ className }: GuidePanelProps) {
  return (
    <div
      data-testid="guide-panel"
      className={clsx('h-full w-full overflow-y-auto bg-background p-4 font-mono', className)}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span>How to use Argon</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Argon answers &ldquo;what must I know before I touch this?&rdquo; from a FalkorDB knowledge
            graph of a codebase — its files, components, decisions, pull requests, reviews and the people
            behind them. Here is the whole loop in five steps.
          </p>
        </header>

        <ol className="space-y-3">
          {STEPS.map(({ Icon, title, body }) => (
            <li key={title} className="border border-border bg-card/60 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-foreground">
                <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{title}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>

        <section className="space-y-2 border border-border bg-muted/20 p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Try these in synthetic-demo
          </h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• <code>Refactor billing/retry.ts</code> — blast radius, owners, and a supersession.</li>
            <li>• <code>I want to work on the auth layer</code> — onboarding path and experts.</li>
            <li>• <code>Why does legacy-sync exist?</code> — architectural provenance.</li>
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Stop FalkorDB (<code>docker compose down</code>) and ask again to see the fail-closed refusal.
          </p>
        </section>
      </div>
    </div>
  );
}
