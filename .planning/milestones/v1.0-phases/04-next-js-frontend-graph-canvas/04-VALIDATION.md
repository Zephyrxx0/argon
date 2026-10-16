---
phase: 4
slug: next-js-frontend-graph-canvas
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (^3.2.0) |
| **Config file** | apps/web/vitest.config.ts |
| **Quick run command** | `pnpm --filter web typecheck` |
| **Full suite command** | `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web build` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web typecheck`
- **After every plan wave:** Run `pnpm --filter web test && pnpm --filter web typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green (`pnpm --filter web build`)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | UI-01 | — | Monorepo dependencies resolve cleanly | build | `pnpm --filter web typecheck` | ✅ | ✅ green |
| 04-01-02 | 01 | 1 | UI-01 | — | Resizable split-pane mounts with collapse toggles | unit | `pnpm --filter web test apps/web/tests/viewport.test.tsx` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | UI-01 | — | Command Bar opens Cmd+K palette on shortcut | unit | `pnpm --filter web test apps/web/tests/command-bar.test.tsx` | ✅ | ✅ green |
| 04-02-02 | 02 | 1 | WS-01 | T-04-01 | Contributor identity switches without auth bypass | unit | `pnpm --filter web test apps/web/tests/workspace.test.tsx` | ✅ | ✅ green |
| 04-03-01 | 03 | 2 | UI-02 | T-04-02 | Route handler validates and sanitizes workspaceId/task | unit | `pnpm --filter web test apps/web/tests/api-briefing.test.ts` | ✅ | ✅ green |
| 04-03-02 | 03 | 2 | UI-02 | — | Evidence Cards render node IDs, status, and Focus button | unit | `pnpm --filter web test apps/web/tests/evidence-card.test.tsx` | ✅ | ✅ green |
| 04-04-01 | 04 | 3 | UI-03 | — | Cytoscape stylesheet parses computed theme variables | unit | `pnpm --filter web test apps/web/tests/cytoscape-style.test.ts` | ✅ | ✅ green |
| 04-04-02 | 04 | 3 | UI-03 | — | Multi-level highlighting pulses cited subgraph | unit | `pnpm --filter web test apps/web/tests/graph-sync.test.ts` | ✅ | ✅ green |
| 04-04-03 | 04 | 3 | UI-03 | T-04-03 | Kill-switch card renders on 503 / integrity failure | unit | `pnpm --filter web test apps/web/tests/briefing-view.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/web/vitest.config.ts` — vitest test runner configuration for React / Next.js
- [x] `apps/web/package.json` — add `vitest`, `@testing-library/react`, `jsdom`, `@argon/agent`
- [x] `apps/web/tests/setup.ts` — mock window.matchMedia and ResizeObserver stubs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cytoscape force animation visual smoothness | UI-03 | Canvas WebGL / 2D rendering animation cannot be captured by JSDOM | Open browser on localhost:3000, trigger query, verify smooth camera pan to bounding box |
| Animated Traversal March marching ants | UI-03 | Canvas edge animation frame timing | Verify edge dash-offset moves along path toward target nodes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** certified green (43/43 unit tests passing, production build passing)

