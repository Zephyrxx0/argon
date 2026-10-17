'use client';

import React, { useMemo, useState } from 'react';
import { Plug, Terminal } from 'lucide-react';
import { clsx } from 'clsx';
import { CodeBlock, CopyButton } from '@/components/common/copy-button';
import {
  MCP_AGENTS,
  MCP_PREREQUISITES,
  MCP_TOOLS,
  samplePrompt,
  type McpContext,
} from '@/lib/mcp-setup';

export interface McpSetupPanelProps {
  /** Workspace pre-filled as ARGON_WORKSPACE_ID in every snippet. */
  workspaceId: string;
  className?: string;
}

const KIND_LABEL: Record<string, string> = {
  json: 'JSON config',
  toml: 'TOML config',
  command: 'Command',
};

/**
 * Step-by-step guide for connecting the Argon MCP server to a coding agent. The config
 * snippets come from `lib/mcp-setup.ts` (one source of truth) and are pre-filled with the
 * active workspace, so what a user copies here is exactly what they paste into their agent.
 */
export function McpSetupPanel({ workspaceId, className }: McpSetupPanelProps) {
  const [agentId, setAgentId] = useState(MCP_AGENTS[0]!.id);
  const agent = MCP_AGENTS.find((a) => a.id === agentId) ?? MCP_AGENTS[0]!;

  const ctx: McpContext = useMemo(
    () => ({ workspaceId: workspaceId || 'synthetic-demo', repoPathHint: '/path/to/argon' }),
    [workspaceId]
  );
  const snippet = agent.snippet(ctx);
  const prompt = samplePrompt(ctx.workspaceId);

  return (
    <div
      data-testid="mcp-setup-panel"
      className={clsx('h-full w-full overflow-y-auto bg-background p-4 font-mono', className)}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Intro */}
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">
            <Plug className="h-4 w-4" aria-hidden="true" />
            <span>Connect Argon to your coding agent (MCP)</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Argon ships an MCP server that exposes its graph tools to any MCP-capable agent. Run it
            over stdio; your agent calls the same reviewed, read-only graph queries the web app uses.
            Logs go to stderr, the protocol to stdout.
          </p>
        </header>

        {/* Step 1: prerequisites */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            1 // Prerequisites
          </h3>
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            {MCP_PREREQUISITES.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Step 2: pick an agent */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            2 // Pick your agent
          </h3>
          <div role="tablist" aria-label="Coding agent" className="flex flex-wrap gap-1.5">
            {MCP_AGENTS.map((a) => (
              <button
                key={a.id}
                role="tab"
                type="button"
                aria-selected={a.id === agentId}
                data-testid={`mcp-agent-${a.id}`}
                onClick={() => setAgentId(a.id)}
                className={clsx(
                  'border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  a.id === agentId
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        </section>

        {/* Step 3: config */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            3 // Add the server
          </h3>
          <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-foreground">{agent.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{agent.location}</div>
            </div>
            <span className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[agent.kind]}
            </span>
          </div>
          <div data-testid="mcp-snippet">
            <CodeBlock
              code={snippet}
              caption={agent.kind === 'command' ? 'run in a terminal' : agent.location}
            />
          </div>
          {agent.note && <p className="text-[11px] leading-relaxed text-muted-foreground">{agent.note}</p>}
        </section>

        {/* Step 4: try it */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            4 // Ask your agent
          </h3>
          <div className="border border-border bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Terminal className="h-3 w-3" aria-hidden="true" /> sample prompt
              </span>
              <CopyButton value={prompt} />
            </div>
            <p className="p-3 text-[11px] leading-relaxed text-foreground">{prompt}</p>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            `generate_briefing` additionally needs a <code>GEMINI_API_KEY</code> in the server env for
            narration; the raw query tools need no LLM. If FalkorDB is unreachable, every tool returns
            an error (&ldquo;NO GRAPH, NO ANSWER&rdquo;) rather than guessing.
          </p>
        </section>

        {/* Tool reference */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Tools exposed ({MCP_TOOLS.length})
          </h3>
          <ul className="divide-y divide-border/50 border border-border">
            {MCP_TOOLS.map((t) => (
              <li key={t.name} className="flex flex-col gap-0.5 px-3 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
                <code className="shrink-0 text-[11px] font-bold text-accent">{t.name}</code>
                <span className="text-[11px] text-muted-foreground">{t.blurb}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            There is deliberately no free-form Cypher tool: only these reviewed, parameterized queries run.
          </p>
        </section>
      </div>
    </div>
  );
}
