---
phase: 02
slug: ingestion-pipeline-decision-mining
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-15
---

# Phase 02 — Validation Strategy: Ingestion Pipeline & Decision Mining

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/ingest/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @argon/ingest test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~1.6 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @argon/ingest test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ING-01 | — | Temporary clone directories are wiped on completion | unit | `pnpm --filter @argon/ingest test test/git.test.ts` | ✅ | ✅ green |
| 02-01-02 | 01 | 1 | ING-01 | — | Raw contributor emails hashed with SHA-256 for privacy | unit | `pnpm --filter @argon/ingest test test/git.test.ts` | ✅ | ✅ green |
| 02-02-01 | 02 | 2 | ING-02 | — | High-churn vendor/lockfile paths excluded from coupling | unit | `pnpm --filter @argon/ingest test test/coupling.test.ts` | ✅ | ✅ green |
| 02-02-02 | 02 | 2 | ING-02 | — | Monorepos mapped to directory packages; min 3 co-commits | unit | `pnpm --filter @argon/ingest test test/coupling.test.ts` | ✅ | ✅ green |
| 02-03-01 | 03 | 2 | DEC-01 | — | Valid frontmatter parsed; commit regex pre-filter applied | unit | `pnpm --filter @argon/ingest test test/mining.test.ts` | ✅ | ✅ green |
| 02-03-02 | 03 | 2 | DEC-02 | — | Predecessor valid_to closed upon supersession | unit | `pnpm --filter @argon/ingest test test/mining.test.ts` | ✅ | ✅ green |
| 02-03-03 | 03 | 2 | ING-03 | — | Git revert messages paired to target commits | unit | `pnpm --filter @argon/ingest test test/mining.test.ts` | ✅ | ✅ green |
| 02-03-04 | 03 | 2 | EMB-01 | — | Decision embeddings truncated to 512 dimensions & L2 normalized | unit | `pnpm --filter @argon/ingest test test/mining.test.ts` | ✅ | ✅ green |
| 02-04-01 | 04 | 3 | JOB-01 | — | IngestJob lifecycle transitions tracked directly in FalkorDB | unit | `pnpm --filter @argon/ingest test test/writer.test.ts` | ✅ | ✅ green |
| 02-04-02 | 04 | 3 | JOB-01 | — | Database writes chunked into 500-item UNWIND batches | unit | `pnpm --filter @argon/ingest test test/writer.test.ts` | ✅ | ✅ green |
| 02-04-03 | 04 | 3 | ING-01, ING-02, ING-03, DEC-01, DEC-02 | — | End-to-end integration verifies graph population from fixture git repo | integration | `pnpm --filter @argon/ingest test test/ingestion.integration.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing test infrastructure in `@argon/ingest` and `@argon/graph` covers all phase requirements.

---

## Manual-Only Verifications

None. All Phase 02 requirements are backed by automated Vitest suites and end-to-end fixture integration tests.

---

## Sign-Off

- [x] All task requirements mapped to automated tests
- [x] 100% of test suites green (`19 passed`, `0 failed`, `1 skipped when offline`)
- [x] No manual-only verification gates needed
- [x] Nyquist compliance certified
