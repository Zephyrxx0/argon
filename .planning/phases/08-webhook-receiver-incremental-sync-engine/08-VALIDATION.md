---
phase: 8
slug: webhook-receiver-incremental-sync-engine
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-16
verified: 2026-10-16
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.0 |
| **Config file** | `apps/gateway/vitest.config.ts`, `packages/graph/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @argon/gateway test run && pnpm --filter web test run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test suite for the modified package (`pnpm --filter <pkg> test run`)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SYNC-01 | T-08-01 | Timing-safe HMAC-SHA256 signature verification rejecting forged webhooks | unit | `pnpm --filter @argon/gateway test run test/middleware/webhook-auth.test.ts` | ✅ | ✅ green |
| 08-01-02 | 01 | 1 | SYNC-01 | T-08-02 | In-memory LRU deduplication cache for delivery GUIDs preventing replay attacks | unit | `pnpm --filter @argon/gateway test run test/services/webhook-dedup.test.ts` | ✅ | ✅ green |
| 08-01-03 | 01 | 2 | SYNC-01 | T-08-03, T-08-04 | Asynchronous webhook acceptance returning 202 Accepted in <50ms with IngestJob queue | integration | `pnpm --filter @argon/gateway test run test/routes/webhooks.test.ts` | ✅ | ✅ green |
| 08-02-01 | 02 | 1 | SYNC-02 | T-08-05 | Parameterized openCypher queries for incremental commits, coupling, and ADR validity | integration | `pnpm --filter @argon/graph test run test/queries/sync.test.ts` | ✅ | ✅ green |
| 08-02-02 | 02 | 2 | SYNC-02 | T-08-06, T-08-08 | In-memory push mutation with file touches, reverts, and 50-file churn-capped co-change | integration | `pnpm --filter @argon/gateway test run test/services/incremental-sync.test.ts` | ✅ | ✅ green |
| 08-02-03 | 02 | 2 | SYNC-03 | T-08-07 | Merged PR ADR diff parsing, 512-d embeddings, and temporal supersession window advancement | integration | `pnpm --filter @argon/gateway test run test/services/incremental-sync.test.ts` | ✅ | ✅ green |
| 08-03-01 | 03 | 1 | SYNC-03 | T-08-09, T-08-10 | Workspace-scoped SSE route with tenant authorization and disconnect cleanup | integration | `pnpm --filter @argon/gateway test run test/routes/events.test.ts` | ✅ | ✅ green |
| 08-03-02 | 03 | 2 | SYNC-03 | — | Unified GraphSyncProvider managing canvas state and SSE reconnect stream | unit | `pnpm --filter web test run tests/graph-sync.test.tsx` | ✅ | ✅ green |
| 08-03-03 | 03 | 2 | SYNC-03 | T-08-11 | HUD live sync pill, Cytoscape pulse styles, and stale briefing alert banner | component | `pnpm --filter web test run tests/components/sync-pulse-canvas.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/gateway/test/middleware/webhook-auth.test.ts` — Timing-safe HMAC verification tests
- [x] `apps/gateway/test/services/webhook-dedup.test.ts` — LRU delivery deduplication cache tests
- [x] `apps/gateway/test/routes/webhooks.test.ts` — Webhook ingestion router integration tests
- [x] `packages/graph/test/queries/sync.test.ts` — Incremental openCypher query tests
- [x] `apps/gateway/test/services/incremental-sync.test.ts` — Incremental sync orchestrator tests
- [x] `apps/gateway/test/routes/events.test.ts` — SSE route and tenant authorization tests
- [x] `apps/web/tests/graph-sync.test.tsx` — EventSource client and GraphSyncProvider tests
- [x] `apps/web/tests/components/sync-pulse-canvas.test.tsx` — HUD badge and stale banner tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real GitHub Webhook Delivery via ngrok/smee | SYNC-01 | Requires active public webhook URL configured on a real GitHub repository | Configure GitHub App webhook URL with secret, trigger push event on GitHub, verify 202 Accepted on gateway |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `status: validated` set in frontmatter

**Approval:** approved (2026-10-16)

---

## Validation Audit 2026-10-16

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Status:** Nyquist compliant (100% of tasks have automated tests running green).

