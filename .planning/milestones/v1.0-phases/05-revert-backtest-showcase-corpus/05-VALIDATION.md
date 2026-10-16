---
phase: 05
slug: revert-backtest-showcase-corpus
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-16
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (workspace monorepo) |
| **Config file** | `packages/eval/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @argon/eval test:unit` |
| **Full suite command** | `pnpm --filter @argon/eval test && pnpm demo:check` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @argon/eval test:unit`
- **After every plan wave:** Run `pnpm --filter @argon/eval test`
- **Before `/gsd-verify-work`:** Full suite must be green + `pnpm demo:check` passes
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | EVAL-01 | — | N/A | unit | `pnpm --filter @argon/eval test test/metrics.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | EVAL-01 | — | N/A | unit | `pnpm --filter @argon/eval test test/fixtures.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 2 | EVAL-01 | — | N/A | integration | `pnpm --filter @argon/eval test test/backtest-runner.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | EVAL-01 | — | N/A | unit | `pnpm --filter @argon/eval test test/replay-cache.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | EVAL-01 | — | N/A | integration | `pnpm --filter @argon/eval test test/baseline-vector.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 2 | EVAL-01 | — | N/A | integration | `pnpm --filter @argon/eval test test/baseline-llm.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 1 | WS-01 | — | N/A | integration | `pnpm --filter @argon/ingest test test/seed-synthetic.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | WS-01 | — | N/A | integration | `pnpm --filter @argon/ingest test test/seed-showcase.test.ts` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 1 | UI-03 | — | N/A | smoke | `pnpm demo:check` | ❌ W0 | ⬜ pending |
| 05-04-02 | 04 | 2 | EVAL-01 | — | N/A | e2e | `pnpm --filter @argon/eval bench:compare` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/eval/vitest.config.ts` — package test config
- [ ] `packages/eval/test/setup.ts` — vitest environment and test fixtures
- [ ] `packages/eval/package.json` — dependency stubs and scripts (`test`, `test:unit`, `bench:compare`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Readme Markdown rendering | EVAL-01 / Hackathon Rule 10 | Visual check of GitHub rendering of tables and Mermaid diagrams | Preview `README.md` and `docs/BLOG-POST.md` in markdown previewer |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-16

