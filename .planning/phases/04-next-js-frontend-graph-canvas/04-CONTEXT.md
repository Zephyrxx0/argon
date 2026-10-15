# Phase 4: Next.js Frontend & Graph Canvas - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the interactive user-facing web application in `apps/web` (Next.js App Router, Tailwind CSS, shadcn/ui, and the 2077 tweakcn brutalist theme). Deliver a unified command bar with guest workspace switcher and "Who am I" contributor picker, rich brutalist Evidence Cards linked to verified graph nodes, and an interactive Cytoscape.js canvas showing query traversal paths behind claims with a strict "no graph, no answer" failure state.

In scope:
- Next.js App Router application in `apps/web` with 2077 tweakcn dark theme styling and monospace typography
- Resizable split-pane layout (`react-resizable-panels`): Left briefing stream (~45%) and Right interactive Cytoscape canvas (~55%) with collapse toggles and responsive mobile tab switching
- Initial Showcase Hub landing state with 3 clickable scenario cards (S1: Refactor `billing/retry.ts`, S2: Auth onboarding, S3: Why does `legacy-sync` exist?) and high-level component map
- Dual Invocation Command Bar: Sticky top-bar search input + `Cmd/Ctrl+K` centered Command Palette (`cmdk` / shadcn `Command`) with file/component autocomplete and curated demo prompts
- Header Guest Workspace Switcher with pre-indexed showcase repos (Ember ADR Corpus, Astro RFC Corpus, Synthetic Demo) + Ingestion Modal with real-time `IngestJob` step progress
- Contributor Picker ("Who am I") header pill and searchable combobox for identity selection without login
- Vertical continuous Briefing View with sticky section jump-bar (`Summary`, `Blast Radius`, `Key Owners`, `Constraining Decisions`, `Precedents`) and citation badge counters
- Rich Brutalist Evidence Cards: Type badge (DECISION/FILE/COMPONENT/PERSON), FalkorDB Node ID (`#id`), temporal status (valid/superseded), direct git/ADR links, and "Focus in Graph" trigger
- Interactive Cytoscape.js canvas running `fcose` / `cose` physics layout, reading 2077 theme CSS tokens at runtime
- Multi-level reactive highlighting: Hover pulses cited nodes/edges and dims background to 20% opacity; clicking locks selection and smoothly pans/zooms camera to subgraph bounding box
- Bidirectional synchronization: Clicking a canvas node displays in-canvas inspector tooltip and smoothly scrolls the left panel to the citing Evidence Card
- Animated Traversal March: Pulsing directed edge glow / animated dash-offset highlighting exact multi-hop paths (blast radius, dependency chains, supersession)
- Floating Cyber HUD Controls: Bottom-right overlay buttons for Zoom In/Out, Fit to View, Re-run Layout, Subgraph Filter (Cited only vs Neighborhood), and Export Snapshot
- Bounded Evidence Subgraph (max ~150 elements from `DualPayload.graph`) with double-click on-demand node expansion
- Brutalist Kill-Switch Hero Card for "No graph, no answer" failure states (`CITATION_INTEGRITY_FAILURE` or `FALKORDB_TIMEOUT` / 503) with diagnostic error badge and DB connection re-test action
- Next.js Server Route Handler (`POST /api/briefing` in `apps/web/app/api/briefing/route.ts`) executing `packages/agent`'s `runBriefingPipeline` with server-side environment credentials

Out of scope:
- Revert backtest evaluation runner and benchmark baseline scripts (Phase 5)
- Automated pre-indexing corpus population scripts for Ember/Astro (Phase 5)
- Multi-step conversational agent loop (`ToolLoopAgent` - deferred to Phase 5 or stretch)
- GitHub App OAuth login and continuous webhook sync (P1/P2 post-hackathon)
</domain>

<decisions>
## Implementation Decisions

### Viewport Layout & Briefing Stream
- **D-01:** Resizable split-pane layout using `react-resizable-panels`: Left briefing stream (~45%) + Right persistent interactive canvas (~55%), with collapse toggles and mobile tab switcher (Briefing / Graph). — **Reversibility:** costly — Defines top-level page architecture and DOM layout.
- **D-02:** Vertical continuous card stream for the 5 briefing sections (`summary`, `blastRadius`, `keyOwners`, `constrainingDecisions`, `precedents`) with a sticky quick-jump pill bar and citation badge counters. — **Reversibility:** reversible — Styling and scroll-navigation component in the briefing pane.
- **D-03:** Showcase Hub landing state: Before a query is entered, display 3 one-click scenario cards (S1: Refactor `billing/retry.ts`, S2: Auth onboarding, S3: Why does `legacy-sync` exist?) while the right canvas renders a high-level component overview map. — **Reversibility:** reversible — Initial state component in `apps/web`.
- **D-04:** Brutalist Kill-Switch Hero Card: High-visibility neon red border (`--color-danger: #ff0055`), diagnostic error badge (e.g. `CITATION_INTEGRITY_FAILURE` / `FALKORDB_TIMEOUT`), explicit "No graph, no answer" refusal copy, and "Test DB Connection" action button. — **Reversibility:** reversible — Failure presentation component.

### Evidence Cards & Canvas Interactivity
- **D-05:** Multi-level reactive highlighting: Hovering an Evidence Card pulses cited nodes/edges in neon cyan/yellow and dims background nodes to 20% opacity; clicking locks selection and smoothly pans/zooms Cytoscape camera to the cited subgraph bounding box. — **Reversibility:** costly — Wires bidirectional event bus between React briefing cards and Cytoscape instance.
- **D-06:** Bidirectional canvas-to-card focus: Clicking a node in the Cytoscape canvas displays an in-canvas inspector tooltip (node ID, properties, source URL) AND smoothly scrolls the left panel to highlight the corresponding Evidence Card. — **Reversibility:** costly — Requires synchronizing canvas click handlers with scroll-into-view hooks.
- **D-07:** Rich Brutalist Evidence Cards: Display Node Type badge (`DECISION`, `FILE`, `COMPONENT`, `PERSON`), FalkorDB Node ID (`#id`), temporal status (`valid_from` to current or superseded by ID), direct git/ADR external link, and a "Focus in Graph" trigger button. — **Reversibility:** reversible — Evidence card presentation component.
- **D-08:** Animated Traversal March: Multi-hop paths (blast radius, dependency chains, supersession) animate edge directional flow (pulsing directed glow / dashed offset animation) along the path from origin to targets. — **Reversibility:** reversible — Cytoscape edge animation styling and timer.

### Command Bar & Workspace Controls
- **D-09:** Dual Invocation Command Bar: Sticky top-bar search input + `Cmd/Ctrl+K` centered Command Palette (`cmdk` / shadcn `Command`) with file/component autocomplete and curated demo prompts. — **Reversibility:** reversible — Navigation and input component.
- **D-10:** Top-Nav Workspace Switcher & Ingestion Modal: Dropdown in header listing pre-indexed showcase repos (Ember ADR Corpus, Astro RFC Corpus, Synthetic Demo) + "Ingest Repo" action opening a modal with real-time `IngestJob` step progress polling (`pending` -> `mining` -> `completed`). — **Reversibility:** costly — Workspace context state management across the web app.
- **D-11:** Header Contributor Picker ("Who am I"): Header pill displaying active identity (e.g. `Sarah Connor [Top Contributor]` or `Guest (Unassigned)`), with searchable combobox to switch/clear identity without login. — **Reversibility:** costly — Contributor identity context passed to briefing generation.
- **D-12:** Next.js Server Route (`POST /api/briefing`): Server-side execution via `packages/agent`'s `runBriefingPipeline`, auto-selecting `HttpGatewayClient` (when `GATEWAY_URL` is set) or `DirectGraphGatewayClient` (direct local FalkorDB connection), keeping gateway bearer tokens private. — **Reversibility:** costly — API boundary between Next.js frontend and briefing engine.

### Cytoscape Engine & 2077 Theme Aesthetics
- **D-13:** Physics Layout with `fcose` / `cose`: Cytoscape force-directed spring layout providing natural clustering by component, collision avoidance, and smooth position animations on update. — **Reversibility:** reversible — Cytoscape layout configuration.
- **D-14:** Semantic Brutalist 2077 Encoding: Node colors read from CSS variables at runtime (`getComputedStyle`). `Decision` = diamond/hex (`#ffb800` warning / `#ff0055` superseded), `Component` = large rounded-rect (`#00f0ff` cyan), `File` = compact rect (`#58a6ff`), `Person` = circle (`#bc8cff`), with dark border glow. — **Reversibility:** reversible — Cytoscape stylesheet definition.
- **D-15:** Floating Cyber HUD Controls: Bottom-right overlay buttons on canvas for Zoom In/Out, Fit to View, Re-run Layout, Subgraph Filter (Cited only vs Neighborhood), and Export Snapshot (PNG/JSON). — **Reversibility:** reversible — Floating HUD overlay component.
- **D-16:** Bounded Evidence Subgraph (max ~150 elements): Render only the primary touched nodes, 1-2 hop blast-radius neighbors, and cited decisions from `DualPayload.graph` for 60fps performance, with on-demand "Expand Node" on double-click. — **Reversibility:** reversible — Subgraph truncation and expansion helper.

### the agent's Discretion
- Internal component file structure within `apps/web/components/` (`canvas/`, `briefing/`, `command/`, `workspace/`, `ui/`).
- Specific Cytoscape spring physics constants (ideal edge length, spring tension, repulsion coefficients).
- Exact animation timing and easing curves for camera pan/zoom and edge dash animations.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD and Architecture
- `PRD.md` §5 — Product concept: intent, not modes ("one workspace, one command bar", "who am I is a selection")
- `PRD.md` §6.1 — Workspaces and access (FR-1 to FR-4: guest mode, contributor picker, graph per workspace)
- `PRD.md` §6.4 — Interface requirements (FR-34 Command Bar, FR-35 Briefing View, FR-36 Evidence Cards, FR-37 Cytoscape canvas, FR-38 Ingest progress, FR-39 "No graph, no answer" failure state, FR-40 429 retry state)
- `PRD.md` §7.4 — The "graph does real work" test (rule 3: canvas renders query results; rule 4: kill-switch test)
- `PRD.md` §8 — System architecture (Browser -> Vercel Next.js app -> Cloud Run gateway / local FalkorDB)
- `PRD.md` §9.1 — Application stack (Next.js App Router, Tailwind CSS, shadcn/ui, 2077 tweakcn theme, Cytoscape.js)
- `DECISIONS.md` §1 GD-07 — In-memory Cytoscape canvas state (client in-memory layout, no DB sync)
- `DECISIONS.md` §1 GD-08 — Guest mode first, defer GitHub App
- `.planning/phases/03-query-gateway-briefing-pipeline/03-CONTEXT.md` — Briefing pipeline and citation schema contracts

### Codebase Interfaces
- `packages/graph/src/queries/types.ts` — `DualPayload<T>`, `CytoscapeElements`, `CytoscapeNodeData`, `CytoscapeEdgeData`
- `packages/graph/src/queries/index.ts` — 8 named query definitions
- `packages/agent/src/briefing/pipeline.ts` — `runBriefingPipeline` and `BriefingResult`
- `packages/agent/src/schemas/briefing.ts` — `BriefingSchema` (5 sections with `citedNodeIds`)
- `packages/agent/src/client/types.ts` — `GatewayClient` interface (`query`, `briefing`)
- `apps/web/app/globals.css` — 2077 theme color variables (`--color-accent`, `--color-warning`, `--color-danger`, `--color-card`, etc.)
- `apps/web/package.json` — Dependencies and scripts

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/graph/src/queries/types.ts`: Provides fully normalized `CytoscapeElements` (`nodes` and `edges`) in every `DualPayload<T>`, ready for direct injection into Cytoscape `elements`.
- `packages/agent`: Exposes `runBriefingPipeline(client, input)` returning validated structured briefings with cited node IDs and citation integrity guarantees.
- `packages/agent/src/client/http.ts` & `direct.ts`: Reusable gateway clients (`HttpGatewayClient` for production Cloud Run gateway, `DirectGraphGatewayClient` for local development against FalkorDB).
- `apps/web/app/globals.css`: Already has the 2077 color scheme variables configured (`--color-background: #090a0f`, `--color-accent: #00f0ff`, `--color-warning: #ffb800`, `--color-danger: #ff0055`, `--color-card: #0d1117`).

### Established Patterns
- Monorepo package imports via `@argon/*` (`@argon/graph`, `@argon/agent`).
- Fail-closed citation integrity: claims must cite verified node IDs; 0 citations triggers `CITATION_INTEGRITY_FAILURE`.
- All database computations happen in FalkorDB; client code only handles layout and interaction.

### Integration Points
- `apps/web/app/api/briefing/route.ts`: Server route handler consuming `packages/agent`'s `runBriefingPipeline`.
- `apps/web/components/canvas/cytoscape-canvas.tsx`: Interactive canvas rendering `CytoscapeElements` from briefing responses.
- `apps/web/components/briefing/briefing-view.tsx`: Briefing stream rendering Evidence Cards linked to canvas nodes.
- `apps/web/components/command/command-bar.tsx`: Unified search and input bar triggering `/api/briefing`.

</code_context>

<specifics>
## Specific Ideas

- Glitch & Cyber Visual Cues: Subtle brutalist borders (`border-2 border-border hover:border-accent`), scanline / subtle grid background (`var(--bg-grid)`), and high-contrast badges for node types.
- Kill-Switch Demo Proof: When demonstrating to judges, toggling FalkorDB off or sending an invalid scope immediately renders the red Brutalist Kill-Switch Hero Card, proving "no graph, no answer" live.
- Zero-Friction Demo: Preloading showcase repositories (Ember ADRs, Astro RFCs, Synthetic Demo) with 3 one-click scenarios lets anyone evaluate Argon in seconds without setup.

</specifics>

<deferred>
## Deferred Ideas

- None — all decisions stayed strictly within Phase 4 scope.

</deferred>

---

*Phase: 4-Next.js Frontend & Graph Canvas*
*Context gathered: 2026-10-15*
