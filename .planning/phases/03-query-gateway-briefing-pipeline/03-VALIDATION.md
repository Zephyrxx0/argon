---
phase: 3
slug: query-gateway-briefing-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution of Phase 3 (Query Gateway & Briefing Pipeline).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `packages/agent/vitest.config.ts`, `apps/gateway/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @argon/gateway test:run` or `pnpm --filter @argon/agent test:run` |
| **Full suite command** | `pnpm test:run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for modified package (`pnpm --filter @argon/gateway test:run` or `pnpm --filter @argon/agent test:run`)
- **After every plan wave:** Run `pnpm test:run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | GW-01 | T-03-01 | Bearer token auth fails closed on unauthorized requests | unit | `pnpm --filter @argon/gateway test:run test/auth.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | GW-01 | T-03-02 | Named queries reject invalid Zod parameters & enforce 5s timeout | integration | `pnpm --filter @argon/gateway test:run test/query.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | BRIEF-01 | — | Hybrid resolver extracts files/components and embeds task query | unit | `pnpm --filter @argon/agent test:run test/resolver.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | BRIEF-01 | — | Parallel dispatcher executes 4 queries concurrently with Promise.allSettled and bounds payload | unit | `pnpm --filter @argon/agent test:run test/dispatcher.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | BRIEF-02 | T-03-03 | Narration produces BriefingSchema; reprompts on schema violation | unit | `pnpm --filter @argon/agent test:run test/narration.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | BRIEF-02 | — | 429 backoff retry and automatic fallback to gemini-2.5-flash-lite | unit | `pnpm --filter @argon/agent test:run test/fallback.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 4 | CITE-01 | T-03-04 | Strips unverified claim node IDs; fails with CITATION_INTEGRITY_FAILURE on 0 citations | unit | `pnpm --filter @argon/agent test:run test/citations.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 4 | MEM-01 | — | record_outcome writes (:Briefing) with [:CITES], [:ABOUT], and optional [:REQUESTED] | integration | `pnpm --filter @argon/agent test:run test/memory.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/gateway/test/auth.test.ts` — test Bearer token verification and /health endpoint
- [ ] `apps/gateway/test/query.test.ts` — test named query endpoints and timeout handling
- [ ] `packages/agent/test/resolver.test.ts` — test scope parsing heuristics
- [ ] `packages/agent/test/dispatcher.test.ts` — test parallel query execution and bounding
- [ ] `packages/agent/test/narration.test.ts` — test Zod schema validation and retry loop
- [ ] `packages/agent/test/citations.test.ts` — test citation integrity filtering and refusal
- [ ] `packages/agent/test/memory.test.ts` — test record_outcome graph write-back

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloud Run Direct VPC Egress | GW-01 | Requires deployed GCP infrastructure | Deploy to Cloud Run test service and curl endpoint through internal VPC |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

