'use client';

import React, { useEffect, useState } from 'react';
import { Bot, ExternalLink, FileText, Terminal } from 'lucide-react';
import { clsx } from 'clsx';
import { CodeBlock, CopyButton } from '@/components/common/copy-button';

export interface LlmsPanelProps {
  className?: string;
}

const DEFAULT_ORIGIN = 'https://136.112.138.59.nip.io';

const RAW_LLMS_TXT = `# Argon: Architectural Memory & Graph Context
Grounded in FalkorDB openCypher knowledge graph. "No graph, no answer."

Endpoints:
- GET /llms.txt                  Standard LLM-readable summary
- POST /api/briefing             Architectural briefing engine
- GET /api/v1/query/named/:name  10 Parameterized openCypher queries
- Stdio MCP Server               pnpm --filter @argon/mcp start

Key Guarantee:
Temporal validity windows (valid_from <= $asOf < valid_to) eliminate
superseded ADR hallucinations. Every claim carries verified node citations.`;

export function LlmsPanel({ className }: LlmsPanelProps) {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

  const snippet = `# Fetch Argon architectural context for your coding agent
curl -s ${origin}/llms.txt

# Or generate a focused briefing directly via JSON API
curl -X POST ${origin}/api/briefing \\
  -H "Content-Type: application/json" \\
  -d '{"workspaceId": "ember-adr-showcase", "target": "packages/@ember/routing"}'`;

  return (
    <div
      data-testid="llms-panel"
      className={clsx('h-full w-full overflow-y-auto bg-background p-4 font-mono', className)}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Intro */}
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>LLM & Agent Machine Context (llms.txt)</span>
            </div>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span>View Raw</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Argon provides a standardized <code className="text-foreground">/llms.txt</code> manifest
            for AI coding models (Claude Code, Cursor, Windsurf, Codex, Gemini). It delivers condensed
            architectural guidance, tool registries, and API schemas designed for minimal token consumption.
          </p>
        </header>

        {/* Quick Usage */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground">
              <Terminal className="h-3.5 w-3.5 text-accent" />
              <span>Agent Consumption Command</span>
            </h3>
            <CopyButton value={snippet} label="Copy Curl" />
          </div>
          <CodeBlock code={snippet} />
        </section>

        {/* llms.txt Content Preview */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground">
              <FileText className="h-3.5 w-3.5 text-accent" />
              <span>Manifest Summary</span>
            </h3>
            <CopyButton value={RAW_LLMS_TXT} label="Copy Summary" />
          </div>
          <CodeBlock code={RAW_LLMS_TXT} />
        </section>
      </div>
    </div>
  );
}
