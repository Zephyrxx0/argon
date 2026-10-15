# Phase 4 Plan 03 Summary: Briefing View, Evidence Cards & API Route

**Milestone:** v1.0 MVP  
**Phase:** 04 — Next.js Frontend & Graph Canvas  
**Plan:** 03 — Briefing View, Evidence Cards & API Route  
**Status:** Completed  
**Completed Date:** 2026-10-15  

---

## 1. Key Accomplishments

1. **Server Route Handler `POST /api/briefing` (`04-03-01`):**
   - Implemented `apps/web/app/api/briefing/route.ts` with strict Zod validation (`BriefingRequestSchema`), path traversal protection for `workspaceId`, and private gateway secret token protection (ASVS Level 1 / Threat `T-04-05`, `T-04-06`).
   - Integrated client auto-selection conforming to `D-12`: dynamically instantiating `HttpGatewayClient` when `GATEWAY_URL` is configured, or `DirectGraphGatewayClient` for local development.
   - Handled FalkorDB socket timeout / connection refusal states by returning HTTP 503 (`FALKORDB_TIMEOUT`) with explicit diagnostic copy.
   - Unit test suite `apps/web/tests/api-briefing.test.ts` (4 tests) passing.

2. **GraphSyncContext & Rich Brutalist Evidence Cards (`04-03-02`):**
   - Implemented `apps/web/lib/graph-sync.tsx` exporting `GraphSyncProvider` and `useGraphSync` hook for bidirectional communication between cards and Cytoscape canvas elements (`hoveredNodeId`, `selectedNodeId`, `focusNode()`).
   - Implemented `apps/web/components/briefing/evidence-card.tsx` (`EvidenceCard`) conforming to `D-07` and `04-UI-SPEC.md`:
     - Color-coded Type badges: `DECISION` (gold `#ffb800`), `COMPONENT` (cyan `#00f0ff`), `FILE` (blue `#58a6ff`), `PERSON` (purple `#bc8cff`).
     - Exact FalkorDB Node ID (`#id`).
     - Temporal validity indicator (`VALID IN FORCE` in emerald vs `SUPERSEDED` in red `#ff0055` with pointer to superseding node ID).
     - "Focus in Graph" action button dispatching `focusNode()`.
   - Unit test suite `apps/web/tests/evidence-card.test.tsx` (3 tests) passing.

3. **Briefing View Stream, Sticky Jump Bar & Kill-Switch Hero Card (`04-03-03`):**
   - Implemented `apps/web/components/briefing/sticky-jump-bar.tsx` (`StickyJumpBar`) with live citation count badges per category and smooth scroll jump links (`[SUMMARY]`, `[BLAST RADIUS]`, `[KEY OWNERS]`, `[DECISIONS]`, `[PRECEDENTS]`).
   - Implemented `apps/web/components/briefing/kill-switch-card.tsx` (`KillSwitchCard`) conforming to `D-04`: high-visibility red border (`#ff0055`), diagnostic badges (`CITATION_INTEGRITY_FAILURE` / `FALKORDB_TIMEOUT`), explicit "No graph, no answer" refusal copy, collapsible Cypher error traceback, and "Test DB Connection" retry trigger.
   - Implemented `apps/web/components/briefing/briefing-view.tsx` (`BriefingView`) rendering 5 brutalist skeleton pulses while loading, the Kill-Switch card on integrity or connection failures, and 5 typed briefing sections with Evidence Cards on success.
   - Connected `BriefingView` to `apps/web/app/page.tsx` within `GraphSyncProvider`.
   - Unit test suite `apps/web/tests/briefing-view.test.tsx` (6 tests) passing.

---

## 2. Verification Results

- `pnpm --filter web typecheck`: **PASS** (zero diagnostic errors)
- `pnpm --filter web test`: **PASS** (8 test files, 38/38 unit tests passing)
  - `tests/api-briefing.test.ts`: 4 passed
  - `tests/briefing-view.test.tsx`: 6 passed
  - `tests/evidence-card.test.tsx`: 3 passed
  - `tests/header.test.tsx`: 5 passed
  - `tests/command-bar.test.tsx`: 6 passed
  - `tests/workspace.test.tsx`: 7 passed
  - `tests/showcase-hub.test.tsx`: 3 passed
  - `tests/viewport.test.tsx`: 4 passed
- `pnpm -r typecheck`: **PASS** across all packages in monorepo

---

## 3. Artifacts Produced

- `apps/web/app/api/briefing/route.ts`: Server Route Handler
- `apps/web/lib/graph-sync.tsx`: Graph synchronization context
- `apps/web/components/briefing/evidence-card.tsx`: EvidenceCard component
- `apps/web/components/briefing/sticky-jump-bar.tsx`: StickyJumpBar component
- `apps/web/components/briefing/kill-switch-card.tsx`: KillSwitchCard component
- `apps/web/components/briefing/briefing-view.tsx`: BriefingView component
- `apps/web/tests/api-briefing.test.ts`: API route tests
- `apps/web/tests/evidence-card.test.tsx`: Evidence card tests
- `apps/web/tests/briefing-view.test.tsx`: Briefing stream tests
- `apps/web/app/page.tsx`: Integrated HomePage

---

## 4. Next Steps

Proceed to Wave 3:
- **`04-04-PLAN.md`:** Cytoscape Canvas, dynamic `fcose` physics layout, 2077 stylesheet, bidirectional card-to-graph highlighting, animated traversal march, and floating Cyber HUD controls.
