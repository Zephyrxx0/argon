---
phase: 1
slug: database-schema-vector-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/graph/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @argon/graph test:unit` |
| **Full suite command** | `pnpm --filter @argon/graph test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @argon/graph test:unit`
- **After every plan wave:** Run `pnpm --filter @argon/graph test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | GRAPH-01 | T-01-01 | Monorepo layout & Docker Compose healthcheck | integration | `pnpm db:healthcheck` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | GRAPH-01 | T-01-02 | Schema constraints & 512-d vector index init | integration | `pnpm --filter @argon/graph test test/schema.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | GRAPH-02 | T-01-03 | 8 named queries & Cytoscape graph transforms | integration | `pnpm --filter @argon/graph test test/queries.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | EMB-01, VEC-01 | T-01-04 | 512-d Matryoshka L2 normalization & fallback | unit | `pnpm --filter @argon/graph test test/embedding.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/graph/test/setup.ts` — test container connection and teardown fixtures
- [ ] `packages/graph/test/seed-fixture.ts` — synthetic test graph data population script
- [ ] `packages/graph/vitest.config.ts` — Vitest configuration for unit and integration suites

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "No graph, no answer" refusal state | GRAPH-01 | Verifies kill-switch behavior when FalkorDB is offline | Stop Docker container (`docker compose down`), trigger connection, confirm `FalkorUnavailableError` refusal message. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-15

