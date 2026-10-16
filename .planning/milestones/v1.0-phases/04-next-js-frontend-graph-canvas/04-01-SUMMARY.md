# Phase 4 Plan 01 Summary: Viewport Layout, Design System & Showcase Hub

**Milestone:** v1.0 MVP  
**Phase:** 04 — Next.js Frontend & Graph Canvas  
**Plan:** 01 — Viewport Layout, Design System & Showcase Hub  
**Status:** Completed  
**Completed Date:** 2026-10-15  

---

## 1. Key Accomplishments

1. **Dependency & Testing Infrastructure (`04-01-01`):**
   - Added `@argon/agent` workspace package, `react-resizable-panels`, `cmdk`, `cytoscape`, `cytoscape-fcose`, `@types/cytoscape`, and `@testing-library/react` to `apps/web/package.json`.
   - Configured `apps/web/vitest.config.ts` with JSDOM environment, globals, path alias `@/*`, and `apps/web/tests/setup.ts` mocking `ResizeObserver` and `window.matchMedia`.
   - Linked all workspace packages via `pnpm install`.

2. **2077 Theme Extractor & Resizable Viewport (`04-01-02`):**
   - Implemented `apps/web/lib/theme.ts` exporting `get2077ThemeTokens()` and `DEFAULT_2077_THEME` with fallback hexadecimal values matching `04-UI-SPEC.md` (`#090a0f`, `#00f0ff`, `#ffb800`, `#ff0055`, `#58a6ff`, `#bc8cff`).
   - Implemented `apps/web/components/layout/split-viewport.tsx` (`SplitViewport`) utilizing `react-resizable-panels` with 45%/55% desktop dual panes, collapse handles (`ChevronLeft`, `ChevronRight`), min/max size constraints (25%-75%), and mobile tab switching (`[BRIEFING]` / `[GRAPH CANVAS]`).

3. **Showcase Hub Landing View & HomePage Integration (`04-01-03`):**
   - Implemented `apps/web/components/hub/showcase-hub.tsx` (`ShowcaseHub`) conforming to `D-03` and UI-SPEC copywriting contracts:
     - Heading: "No Architectural Briefing Generated"
     - Guidance: "Enter a target file path, component name, or task in the command bar above, or select a showcase scenario to compute evidence-backed graph claims."
     - 3 curated cyber scenario cards:
       1. **S1 (Blast Radius & Owners):** "Refactor `billing/retry.ts`"
       2. **S2 (Onboarding Path):** "I want to work on the auth layer"
       3. **S3 (Architectural Precedent):** "Why does `legacy-sync` exist?"
     - Philosophy callout: "No graph, no answer" verification guarantee.
   - Updated `apps/web/app/page.tsx` to host `SplitViewport`, rendering `ShowcaseHub` in the left briefing stream and topological canvas standby in the right panel.

---

## 2. Verification Results

- `pnpm --filter web typecheck`: **PASS** (zero TypeScript diagnostic errors)
- `pnpm --filter web test`: **PASS** (2 test suites, 7/7 unit tests passing)
  - `tests/viewport.test.tsx`: 4 tests passed
  - `tests/showcase-hub.test.tsx`: 3 tests passed
- `pnpm -r typecheck`: **PASS** (monorepo clean across `@argon/graph`, `@argon/ingest`, and `web`)

---

## 3. Artifacts Produced

- `apps/web/package.json`
- `apps/web/vitest.config.ts`
- `apps/web/tests/setup.ts`
- `apps/web/lib/theme.ts`
- `apps/web/components/layout/split-viewport.tsx`
- `apps/web/components/hub/showcase-hub.tsx`
- `apps/web/tests/viewport.test.tsx`
- `apps/web/tests/showcase-hub.test.tsx`
- `apps/web/app/page.tsx`

---

## 4. Next Steps

Proceed to Wave 2:
- **`04-02-PLAN.md`:** Command Bar (`Cmd+K` palette), Workspace Switcher, Ingest Modal, and Contributor Picker.
- **`04-03-PLAN.md`:** Briefing View, Evidence Cards, Kill-Switch Hero Card, and `/api/briefing` Route.

