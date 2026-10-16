# Phase 4 Plan 04 Summary: Cytoscape Canvas, 2077 Theme, Bidirectional Focus & Production Build

**Milestone:** v1.0 MVP  
**Phase:** 04 — Next.js Frontend & Graph Canvas  
**Plan:** 04 — Cytoscape Canvas, 2077 Theme, Bidirectional Focus & HUD Controls  
**Status:** Completed  
**Completed Date:** 2026-10-15  

---

## 1. Key Accomplishments

1. **Cytoscape Canvas Wrapper & 2077 Brutalist Stylesheet (`04-04-01`):**
   - Implemented `apps/web/components/canvas/stylesheet.ts` (`createCytoscapeStylesheet`) mapping 2077 semantic tokens to node shapes, borders, and colors:
     - Decisions: `diamond`, `#ffb800` (superseded in `#ff0055` dashed)
     - Components: `round-rectangle`, `#00f0ff`
     - Files: `rectangle`, `#58a6ff`
     - Persons: `ellipse`, `#bc8cff`
     - Highlighted state: `#00f0ff` glow with `4px` border and elevated z-index
     - Dimmed state: `0.2` opacity for background nodes
     - Marching edge state: `#00f0ff` dashed edge
   - Implemented `apps/web/components/canvas/cytoscape-canvas.tsx` (`CytoscapeCanvas`) utilizing `cytoscape-fcose` for physics force layout, with cleanup (`cy.destroy()`) on unmount to prevent memory leaks (mitigating T-04-07).
   - Created `apps/web/types/cytoscape-fcose.d.ts` for type safety.
   - Unit test suite `apps/web/tests/cytoscape-style.test.ts` passing.

2. **Bidirectional Highlighting, Focus & Traversal Animator (`04-04-02`):**
   - Implemented `apps/web/components/canvas/traversal-animator.ts` (`startMarchingAnimation`, `stopMarchingAnimation`) using `requestAnimationFrame` to animate line-dash-offset along traversal paths conforming to `D-08`.
   - Implemented `apps/web/components/canvas/node-inspector.tsx` (`NodeInspector`) rendering an in-canvas floating popover on node click, displaying node attributes, FalkorDB node ID `#id`, and a "Jump to Cited Claim" action that scrolls the corresponding Evidence Card into view in the left briefing panel conforming to `D-06`.
   - Wired `useGraphSync` bidirectional focus into `CytoscapeCanvas`:
     - Card hover pulses cited nodes and dims background elements to 20% opacity conforming to `D-05`.
     - Card "Focus in Graph" smoothly animates the camera to fit the bounding box of the node.
     - Canvas node click triggers inspection and highlights connected neighbors.
   - Integration test suite `apps/web/tests/graph-sync.test.ts` passing.

3. **Cyber HUD Controls, Performance Bounds & Full Page Integration (`04-04-03`):**
   - Implemented `apps/web/components/canvas/hud-controls.tsx` (`HudControls`) with Zoom In (`+`), Zoom Out (`-`), Fit to View, Re-run Layout (`fcose`), Subgraph Filter ("All Elements" vs "Cited Only"), and Export Snapshot (JSON and PNG data URI export) conforming to `D-15`.
   - Enforced Decision `D-16`: bounded initial rendered subgraph to max 150 elements for 60fps performance, with double-click expansion capability.
   - Integrated full interactive experience in `apps/web/app/page.tsx`, bringing together `HeaderBar`, `SplitViewport`, `BriefingView`, `CytoscapeCanvas`, `HudControls`, and `GraphSyncProvider`.
   - Optimized Next.js server bundling in `apps/web/next.config.ts` (`serverExternalPackages` with FalkorDB, Redis, HuggingFace transformers, ONNX runtime, and dynamic imports in route handler) enabling clean production builds.
   - Integration test suite `apps/web/tests/page-integration.test.tsx` passing.

---

## 2. Verification Results

- `pnpm --filter web test`: **PASS** (11/11 test files, 43/43 unit and integration tests passing)
  - `tests/page-integration.test.tsx`: 2 passed
  - `tests/api-briefing.test.ts`: 4 passed
  - `tests/briefing-view.test.tsx`: 6 passed
  - `tests/evidence-card.test.tsx`: 3 passed
  - `tests/cytoscape-style.test.ts`: 1 passed
  - `tests/graph-sync.test.ts`: 2 passed
  - `tests/command-bar.test.tsx`: 6 passed
  - `tests/workspace.test.tsx`: 7 passed
  - `tests/header.test.tsx`: 5 passed
  - `tests/showcase-hub.test.tsx`: 3 passed
  - `tests/viewport.test.tsx`: 4 passed
- `pnpm -r typecheck`: **PASS** across all packages in the monorepo (`@argon/graph`, `@argon/agent`, `@argon/ingest`, `apps/web`)
- `pnpm --filter web build`: **PASS** (Exit Code 0, optimized Next.js 15 production build compiled and statically prerendered)

---

## 3. Artifacts Produced

- `apps/web/components/canvas/cytoscape-canvas.tsx`: Interactive Cytoscape canvas component
- `apps/web/components/canvas/stylesheet.ts`: 2077 semantic Cytoscape stylesheet generator
- `apps/web/components/canvas/traversal-animator.ts`: Marching edges animation engine
- `apps/web/components/canvas/node-inspector.tsx`: In-canvas node inspection popover
- `apps/web/components/canvas/hud-controls.tsx`: Floating Cyber HUD control toolbar
- `apps/web/types/cytoscape-fcose.d.ts`: Typings for cytoscape-fcose extension
- `apps/web/tests/cytoscape-style.test.ts`: Stylesheet unit tests
- `apps/web/tests/graph-sync.test.ts`: Bidirectional synchronization integration tests
- `apps/web/tests/page-integration.test.tsx`: Full page query-to-canvas integration tests
- `apps/web/app/page.tsx`: Integrated home page component
- `apps/web/next.config.ts`: Configured external server packages

---

## 4. Phase 04 Completion Summary

Phase 04 ("Next.js Frontend & Graph Canvas") is now **100% complete**.
All 4 plans (`04-01`, `04-02`, `04-03`, `04-04`) are executed, tested, and verified against PRD requirements `WS-01`, `UI-01`, `UI-02`, and `UI-03`.

