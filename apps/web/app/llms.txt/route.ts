import { type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '') ||
    '136.112.138.59.nip.io';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;

  const text = `# Argon

> Context for AI Agents & Engineers — "What must I know before I touch this?"
> Grounded in the FalkorDB openCypher knowledge graph. "No graph, no answer."

## Overview
Argon is an evidence-backed architectural briefing engine for software engineering teams and AI coding agents. Before an agent (Claude Code, Cursor, Windsurf, Codex, Gemini) or software engineer touches code, Argon answers: "What must I know before I touch this?"

Instead of naive vector search that hallucinates obsolete conventions or relational databases that struggle with multi-hop dependencies, Argon queries an openCypher knowledge graph hosted in FalkorDB. Every blast radius calculation, reviewer recommendation, architectural constraint, and historical precedent is computed through graph traversals, PageRank centrality, and temporal $asOf predicates.

## Core Capabilities
- **Blast Radius Analysis**: Multi-hop graph traversals mapping files, components, and downstream dependents.
- **Architectural Decision Records (ADRs)**: Temporal validity windows (valid_from <= $asOf < valid_to) ensuring superseded decisions are never cited as active guidance.
- **Historical Revert Precedents**: Detects previous regressions, anti-patterns, and reverts touching the requested scope.
- **Domain Owners & CODEOWNERS**: Discovers domain owners, teams, and active contributors.
- **Fail-Closed Citation Integrity**: Every single claim cites a verified FalkorDB node #id. Uncited claims are stripped; zero citations triggers an automatic refusal: "No graph, no answer."

## Model Context Protocol (MCP) Integration
Argon provides an official Model Context Protocol (MCP) server exposing 13 pre-budgeted, read-only graph tools:
- **Command**: pnpm --filter @argon/mcp start
- **Tools**:
  - generate_briefing: Synthesizes a structured architectural briefing.
  - blast_radius: Multi-hop dependency & blast radius traversal.
  - find_superseded_decisions: Evaluates active vs historical superseded ADRs.
  - revert_precedents: Inspects past reverts touching target files.
  - component_owners: Identifies team and developer ownership.
  - component_dependencies: Directed component dependency graphs.

## HTTP Endpoints
- Base URL: ${origin}
- GET ${origin}/llms.txt: This manifest file.
- POST ${origin}/api/briefing: Generate an architectural briefing for a target file, component, or freeform query.
- GET ${origin}/api/v1/query/named/:queryName: Execute one of the 10 parameterized openCypher queries against FalkorDB.
- GET ${origin}/api/v1/events/subscribe: Real-time Server-Sent Events (SSE) streaming sync events.

## Showcases
- ember-adr-showcase: Curated Ember.js architectural RFC and ADR corpus with historical reverts.
- synthetic-demo: Distributed multi-service architecture test graph.
- argon-dogfood: Self-indexed Argon codebase graph.
`;

  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
