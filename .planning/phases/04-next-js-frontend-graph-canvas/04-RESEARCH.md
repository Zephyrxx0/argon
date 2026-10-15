# Phase 4: Next.js Frontend & Graph Canvas - Research

**Date:** 2026-10-15  
**Milestone:** v1.0 MVP  
**Phase:** 04 — Next.js Frontend & Graph Canvas  
**Requirements:** WS-01, UI-01, UI-02, UI-03  

---

## Executive Summary

Phase 4 builds the primary user-facing experience of Argon: an interactive, cyberpunk brutalist web application (`apps/web`) powered by Next.js 15 App Router, Tailwind CSS, shadcn/ui, and the 2077 tweakcn dark theme [VERIFIED: PRD §9.1; 04-CONTEXT.md].

The frontend implements Argon's "one workspace, one command bar" philosophy [VERIFIED: PRD §5]. A developer states a target scope or task, and Argon renders a unified, resizable split-view:
1. **Left Panel (~45%):** A vertical continuous stream of structured briefing evidence cards linked to verified FalkorDB nodes and git/ADR sources [VERIFIED: 04-CONTEXT.md D-01, D-02, D-07].
2. **Right Panel (~55%):** An interactive, physics-driven Cytoscape.js canvas (`fcose`) displaying the exact traversal subgraphs behind the claims, with bidirectional highlighting between cards and canvas nodes [VERIFIED: 04-CONTEXT.md D-05, D-06, D-13].

Critically, the frontend embodies the project's core judging thesis: **"no graph, no answer."** If FalkorDB is unreachable (HTTP 503) or if citation validation drops claims due to zero verified graph nodes, the UI refuses to display hallucinated text and renders a prominent, glitch-styled Brutalist Kill-Switch Hero Card with actionable diagnostic information [VERIFIED: PRD §7.4; 04-CONTEXT.md D-04].

---

## 1. Locked Decisions & User Constraints

The following user decisions from [04-CONTEXT.md](file:///.planning/phases/04-next-js-frontend-graph-canvas/04-CONTEXT.md) and [04-UI-SPEC.md](file:///.planning/phases/04-next-js-frontend-graph-canvas/04-UI-SPEC.md) are locked and govern all architectural plans:

| Decision ID | Area | Decision Summary | Source / Constraint |
|---|---|---|---|
| **D-01** | Viewport Layout | Resizable split-pane layout using `react-resizable-panels`: Left briefing stream (~45%) + Right persistent interactive canvas (~55%), with collapse toggles and mobile tab switcher (Briefing / Graph). | [VERIFIED: 04-CONTEXT.md D-01] |
| **D-02** | Stream Navigation | Vertical continuous card stream for the 5 briefing sections (`summary`, `blastRadius`, `keyOwners`, `constrainingDecisions`, `precedents`) with a sticky quick-jump pill bar and citation badge counters. | [VERIFIED: 04-CONTEXT.md D-02] |
| **D-03** | Initial Landing State | Showcase Hub landing state: Before a query is entered, display 3 one-click scenario cards (S1: Refactor `billing/retry.ts`, S2: Auth onboarding, S3: Why does `legacy-sync` exist?) while the right canvas renders a high-level component overview map. | [VERIFIED: 04-CONTEXT.md D-03] |
| **D-04** | Kill-Switch Refusal | Brutalist Kill-Switch Hero Card: High-visibility neon red border (`--color-danger: #ff0055`), diagnostic error badge (e.g. `CITATION_INTEGRITY_FAILURE` / `FALKORDB_TIMEOUT`), explicit "No graph, no answer" refusal copy, and "Test DB Connection" action button. | [VERIFIED: 04-CONTEXT.md D-04] |
| **D-05** | Card-to-Graph Focus | Multi-level reactive highlighting: Hovering an Evidence Card pulses cited nodes/edges in neon cyan/yellow and dims background nodes to 20% opacity; clicking locks selection and smoothly pans/zooms Cytoscape camera to the cited subgraph bounding box. | [VERIFIED: 04-CONTEXT.md D-05] |
| **D-06** | Graph-to-Card Focus | Bidirectional canvas-to-card focus: Clicking a node in the Cytoscape canvas displays an in-canvas inspector tooltip (node ID, properties, source URL) AND smoothly scrolls the left panel to highlight the corresponding Evidence Card. | [VERIFIED: 04-CONTEXT.md D-06] |
| **D-07** | Evidence Card Design | Rich Brutalist Evidence Cards: Display Node Type badge (`DECISION`, `FILE`, `COMPONENT`, `PERSON`), FalkorDB Node ID (`#id`), temporal status (`valid_from` to current or superseded by ID), direct git/ADR external link, and a "Focus in Graph" trigger button. | [VERIFIED: 04-CONTEXT.md D-07] |
| **D-08** | Traversal Animation | Animated Traversal March: Multi-hop paths (blast radius, dependency chains, supersession) animate edge directional flow (pulsing directed glow / dashed offset animation) along the path from origin to targets. | [VERIFIED: 04-CONTEXT.md D-08] |
| **D-09** | Command Bar UX | Dual Invocation Command Bar: Sticky top-bar search input + `Cmd/Ctrl+K` centered Command Palette (`cmdk` / shadcn `Command`) with file/component autocomplete and curated demo prompts. | [VERIFIED: 04-CONTEXT.md D-09] |
| **D-10** | Workspace Controls | Top-Nav Workspace Switcher & Ingestion Modal: Dropdown in header listing pre-indexed showcase repos (Ember ADR Corpus, Astro RFC Corpus, Synthetic Demo) + "Ingest Repo" action opening a modal with real-time `IngestJob` step progress polling (`pending` -> `mining` -> `completed`). | [VERIFIED: 04-CONTEXT.md D-10] |
| **D-11** | Contributor Identity | Header Contributor Picker ("Who am I"): Header pill displaying active identity (e.g. `Sarah Connor [Top Contributor]` or `Guest (Unassigned)`), with searchable combobox to switch/clear identity without login. | [VERIFIED: 04-CONTEXT.md D-11] |
| **D-12** | Backend Wiring | Next.js Server Route (`POST /api/briefing`): Server-side execution via `packages/agent`'s `runBriefingPipeline`, auto-selecting `HttpGatewayClient` (when `GATEWAY_URL` is set) or `DirectGraphGatewayClient` (direct local FalkorDB connection), keeping gateway bearer tokens private. | [VERIFIED: 04-CONTEXT.md D-12] |
| **D-13** | Physics Layout | Physics Layout with `fcose` / `cose`: Cytoscape force-directed spring layout providing natural clustering by component, collision avoidance, and smooth position animations on update. | [VERIFIED: 04-CONTEXT.md D-13] |
| **D-14** | Semantic Encoding | Semantic Brutalist 2077 Encoding: Node colors read from CSS variables at runtime (`getComputedStyle`). `Decision` = diamond/hex (`#ffb800` warning / `#ff0055` superseded), `Component` = large rounded-rect (`#00f0ff` cyan), `File` = compact rect (`#58a6ff`), `Person` = circle (`#bc8cff`), with dark border glow. | [VERIFIED: 04-CONTEXT.md D-14] |
| **D-15** | HUD Controls | Floating Cyber HUD Controls: Bottom-right overlay buttons on canvas for Zoom In/Out, Fit to View, Re-run Layout, Subgraph Filter (Cited only vs Neighborhood), and Export Snapshot (PNG/JSON). | [VERIFIED: 04-CONTEXT.md D-15] |
| **D-16** | Performance Bounds | Bounded Evidence Subgraph (max ~150 elements): Render only the primary touched nodes, 1-2 hop blast-radius neighbors, and cited decisions from `DualPayload.graph` for 60fps performance, with on-demand "Expand Node" on double-click. | [VERIFIED: 04-CONTEXT.md D-16] |

---

## 2. Requirement Traceability Matrix

| Requirement | Plan | Description | Status & Target Component |
|---|---|---|---|
| **WS-01** | 04-02 | Guest-first workspaces supporting arbitrary git repositories without mandatory login, with pre-indexed showcase workspaces and contributor identity selection. | Pending -> `apps/web/components/workspace/` |
| **UI-01** | 04-02 | Command bar interface with `Cmd+K` palette, instant autocomplete, and preset scenario prompt chips. | Pending -> `apps/web/components/command/` |
| **UI-02** | 04-03 | Briefing View with brutalist Evidence Cards (2077 tweakcn theme) linked to exact graph nodes and git/ADR sources. | Pending -> `apps/web/components/briefing/` |
| **UI-03** | 04-04 | Interactive Cytoscape.js canvas showing traversal paths behind claims with in-memory layout, reactive highlighting, and "no graph, no answer" failure states. | Pending -> `apps/web/components/canvas/` |

---

## 3. Plan-by-Plan Technical Analysis

### Plan 04-01: Foundation & Resizable Viewport Layout
- **Goal:** Install required web dependencies (`@argon/agent`, `react-resizable-panels`, `lucide-react`, radix primitives), configure the 2077 cyberpunk design tokens, and build the resizable split-pane layout with mobile tab switching and initial Showcase Hub landing state.
- **Key Modules:**
  - `apps/web/package.json`: Add `@argon/agent`, `react-resizable-panels`, `cmdk`.
  - `apps/web/components/layout/split-viewport.tsx`: Resizable panel group managing left briefing panel (~45%) and right canvas panel (~55%), with collapse buttons and mobile tab switcher.
  - `apps/web/components/hub/showcase-hub.tsx`: Landing view with 3 scenario cards (S1: Refactor `billing/retry.ts`, S2: Auth onboarding, S3: Why does `legacy-sync` exist?) and high-level component map.
  - `apps/web/lib/theme.ts`: Helper to read CSS theme variables at runtime (`getComputedStyle`) for canvas styling.

### Plan 04-02: Command Bar, Workspace Switcher & Contributor Selector
- **Goal:** Build the unified input surface (`UI-01`), guest repository ingest modal, and contributor picker ("Who am I") (`WS-01`).
- **Key Modules:**
  - `apps/web/components/command/command-bar.tsx`: Sticky header search input with `Cmd+K` shortcut trigger and submit handler.
  - `apps/web/components/command/command-dialog.tsx`: Centered modal palette using `cmdk` with sections for "Curated Scenarios", "Files & Components", and "Recent Queries".
  - `apps/web/components/workspace/workspace-switcher.tsx`: Header dropdown showing active workspace ("Ember ADR Corpus", "Astro RFC Corpus", "Synthetic Demo", or custom repo) with an "Ingest Repo" action.
  - `apps/web/components/workspace/ingest-modal.tsx`: Dialog prompting for a git URL with real-time `(:IngestJob)` polling status (`pending` -> `cloning` -> `mining` -> `completed`).
  - `apps/web/components/contributor/contributor-picker.tsx`: Header pill showing active developer identity with searchable combobox to switch/clear identity without login.

### Plan 04-03: Briefing View, Evidence Cards & API Route
- **Goal:** Build the server-side briefing execution route (`/api/briefing`) and the client-side vertical card stream (`UI-02`) with rich Evidence Cards.
- **Key Modules:**
  - `apps/web/app/api/briefing/route.ts`: Next.js Server Route Handler executing `runBriefingPipeline` from `packages/agent`, auto-selecting `HttpGatewayClient` (if `GATEWAY_URL` is set) or `DirectGraphGatewayClient` (local dev FalkorDB connection), keeping bearer tokens private.
  - `apps/web/components/briefing/briefing-view.tsx`: Continuous vertical scroll stream rendering the 5 structured sections: `summary`, `blastRadius`, `keyOwners`, `constrainingDecisions`, `precedents`.
  - `apps/web/components/briefing/sticky-jump-bar.tsx`: Sticky pill navigation bar with active section indicator and citation count badges.
  - `apps/web/components/briefing/evidence-card.tsx`: Brutalist card displaying Type badge (`DECISION`, `FILE`, `COMPONENT`, `PERSON`), FalkorDB Node ID (`#id`), temporal validity badge, direct git/ADR external link, and "Focus in Graph" trigger button.
  - `apps/web/components/briefing/kill-switch-card.tsx`: Glitch-styled red warning hero card for "No graph, no answer" refusal when graph connection fails or 0 citations pass integrity validation.

### Plan 04-04: Cytoscape Canvas & Interactive Subgraph Traversal
- **Goal:** Integrate Cytoscape.js with `fcose` physics layout (`UI-03`), multi-level reactive highlighting, bidirectional focus, animated traversal march, and floating Cyber HUD controls.
- **Key Modules:**
  - `apps/web/components/canvas/cytoscape-canvas.tsx`: Client-only dynamic component (`next/dynamic` with `ssr: false`) embedding Cytoscape.js, managing instance lifecycle and resize events.
  - `apps/web/components/canvas/stylesheet.ts`: Cytoscape stylesheet reading CSS variables at runtime, applying semantic colors (Decisions `#ffb800` / `#ff0055`, Components `#00f0ff`, Files `#58a6ff`, Persons `#bc8cff`) and glowing dark borders.
  - `apps/web/components/canvas/traversal-animator.ts`: Edge dash-offset and pulse animation highlighting multi-hop traversal paths (blast radius, dependency chains, supersession).
  - `apps/web/components/canvas/hud-controls.tsx`: Floating bottom-right controls for Zoom In/Out, Fit to View, Re-run Layout, Subgraph Filter (Cited only vs Neighborhood), and Export Snapshot (PNG/JSON).
  - `apps/web/components/canvas/node-inspector.tsx`: In-canvas popover showing properties, Cypher query link, and direct jump to cited Evidence Card.
  - `apps/web/lib/graph-sync.ts`: Shared state bus / React context linking hovered/selected node IDs between Evidence Cards and Cytoscape elements.

---

## 4. Standard Stack & Library Selection

| Library | Version | Purpose | Provenance & Validation |
|---|---|---|---|
| `next` | `15.2.0` | React framework (App Router) | [VERIFIED: apps/web/package.json] |
| `react` / `react-dom` | `^19.0.0` | UI component library | [VERIFIED: apps/web/package.json] |
| `@argon/agent` | `workspace:*` | Briefing pipeline & gateway clients | [VERIFIED: packages/agent/src/index.ts] |
| `@argon/graph` | `workspace:*` | Graph query types & Cytoscape schemas | [VERIFIED: packages/graph/src/queries/types.ts] |
| `react-resizable-panels` | `^2.1.7` (or `4.x`) | Resizable desktop split pane | [VERIFIED: npm registry] |
| `cmdk` | `^1.1.1` | Command Palette keyboard interface | [VERIFIED: npm registry] |
| `cytoscape` | `^3.34.3` | In-memory graph canvas rendering | [VERIFIED: npm registry] |
| `cytoscape-fcose` | `^2.2.0` | Compound Spring Embedder force layout | [VERIFIED: npm registry] |
| `@types/cytoscape` | `^3.31.0` | TypeScript definitions for Cytoscape | [VERIFIED: npm registry] |
| `lucide-react` | `^1.16.0` | Cyber/system icons | [VERIFIED: apps/web/package.json] |
| `clsx` / `tailwind-merge` | `^2.1.1` / `^3.0.0` | Utility class merging | [VERIFIED: apps/web/package.json] |

---

## 5. Architecture & State Management Patterns

### 5.1 Bidirectional State Synchronization
To prevent tight coupling between the React tree (Evidence Cards) and the imperative Cytoscape canvas instance, communication flows through a lightweight `GraphSyncContext`:
```ts
export interface GraphSyncState {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  highlightedSubgraph: {
    nodeIds: string[];
    edgeIds: string[];
  } | null;
  focusTrigger: {
    targetId: string;
    timestamp: number;
    zoomLevel?: number;
  } | null;
}
```
1. **Card -> Graph:** Hovering an Evidence Card sets `hoveredNodeId` and `highlightedSubgraph`. The Cytoscape component listens to state changes and sets a `.highlighted` class on cited elements while applying `.dimmed` (opacity 0.2) to others. Clicking "Focus in Graph" updates `focusTrigger`, invoking `cy.animate({ fit: { eles, padding: 50 }, duration: 400 })`.
2. **Graph -> Card:** Clicking a node in Cytoscape sets `selectedNodeId` and emits an event. The Briefing View listens and calls `document.getElementById(`evidence-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.

### 5.2 Server Route Architecture (`apps/web/app/api/briefing/route.ts`)
```ts
import { runBriefingPipeline, HttpGatewayClient, DirectGraphGatewayClient } from '@argon/agent';
import { ArgonGraphClient } from '@argon/graph';

export async function POST(req: Request) {
  const body = await req.json();
  const { task, workspaceId = 'default', files, components, contributorId } = body;

  const client = process.env.GATEWAY_URL
    ? new HttpGatewayClient({ baseUrl: process.env.GATEWAY_URL, secret: process.env.GATEWAY_SECRET })
    : new DirectGraphGatewayClient(new ArgonGraphClient());

  const result = await runBriefingPipeline(client, { task, workspaceId, files, components, contributorId });
  return Response.json(result);
}
```

---

## 6. Don't Hand-Roll

| Problem | Recommended Library | Why Don't Hand-Roll |
|---|---|---|
| Split pane layout | `react-resizable-panels` | Handles touch, pointer capture, keyboard accessibility, min/max constraints, and SSR hydration cleanly. |
| Graph layout algorithm | `cytoscape-fcose` | Compound force simulation with clustering, collision detection, and edge routing is mathematically complex. |
| Command Palette | `cmdk` | Accessible keyboard navigation, item scoring, and ARIA attributes out of the box. |
| Citation verification | `packages/agent` (`verifyCitations`) | Uses the verified Phase 3 citation validator with strict fail-closed refusal rules. |

---

## 7. Common Pitfalls & Edge Cases

1. **Next.js SSR vs Cytoscape.js:**
   - *Pitfall:* Cytoscape accesses `window` and `document` on import and instantiation. Attempting to render Cytoscape on the server triggers `ReferenceError: document is not defined`.
   - *Mitigation:* Always load the Cytoscape wrapper using `next/dynamic` with `{ ssr: false }` or inside a `useEffect` within a `'use client'` component.
2. **React 19 StrictMode Double Mount:**
   - *Pitfall:* In React 19 development mode, effects mount twice. If Cytoscape instances are created without disposing previous instances, multiple canvases stack on top of each other, leaking memory.
   - *Mitigation:* Store the instance in a `useRef<cytoscape.Core | null>(null)` and call `cy.destroy()` in the `useEffect` cleanup return.
3. **Large Graph Performance Degradation:**
   - *Pitfall:* Injecting thousands of nodes into Cytoscape causes frame drops and layout lag during force simulation.
   - *Mitigation:* Enforce Decision D-16: Bounded Evidence Subgraph (max ~150 elements from `DualPayload.graph`). Show primary touched nodes and 1-2 hop blast radius neighbors, with on-demand double-click expansion.
4. **CSS Variable Runtime Resolution in Canvas:**
   - *Pitfall:* Cytoscape canvas cannot natively parse Tailwind `@theme` CSS variable references like `var(--color-accent)`.
   - *Mitigation:* Extract computed hex values via `window.getComputedStyle(document.body).getPropertyValue('--color-accent')` when constructing the Cytoscape stylesheet.

---

## 8. Validation Architecture

### Dimension 8 Test Strategy (Nyquist Validation):
1. **Unit Tests (Vitest):**
   - `apps/web/tests/api-briefing.test.ts`: Tests `POST /api/briefing` route handler with mocked `GatewayClient`, verifying success envelope, `NO_GRAPH_DATA`, and `CITATION_INTEGRITY_FAILURE` handling.
   - `apps/web/tests/graph-sync.test.ts`: Verifies `GraphSyncContext` state transitions (hover, select, focus, clear).
   - `apps/web/tests/evidence-card.test.tsx`: Tests that Evidence Cards correctly render node type badges, IDs, and trigger focus events.
2. **Component Integration Tests:**
   - Verify `SplitViewport` renders Left and Right panels and toggles collapse states.
   - Verify `CommandBar` opens `Cmd+K` palette on keyboard shortcut.
   - Verify `KillSwitchCard` renders on error and triggers retry callback.
3. **Typecheck & Build:**
   - `pnpm --filter web typecheck` and `pnpm --filter web build` must pass without warnings.

