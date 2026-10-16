---
requirements-completed:
  - SYNC-01
---

# Plan 08-01: Summary

**Plan:** 08-01 — HMAC-Verified Webhook Listener & Async Ingestion Job Engine  
**Completed:** 2026-10-16  
**Status:** Success  

---

## What was built

1. **Timing-Safe HMAC-SHA256 Webhook Middleware (`apps/gateway/src/middleware/webhook-auth.ts`):**
   - Implemented `computeSignature` and `timingSafeCompare` using Node.js `crypto.timingSafeEqual` and `crypto.createHmac`.
   - Created `webhookSignatureValidator` verifying `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET` before passing control downstream.
   - Rejects missing signatures with `401 MISSING_SIGNATURE` and mismatched signatures with `401 INVALID_SIGNATURE`.

2. **LRU Webhook Delivery Deduplication Cache (`apps/gateway/src/services/webhook-dedup.ts`):**
   - Implemented `WebhookDeduplicator` managing an in-memory cache of the last 10,000 `X-GitHub-Delivery` GUIDs.
   - Detects duplicate deliveries in $O(1)$ and evicts oldest items in FIFO/LRU order when capacity is reached.

3. **Webhook Router & IngestJob Orchestrator (`apps/gateway/src/routes/webhooks.ts`, `apps/gateway/src/services/sync-orchestrator.ts`):**
   - Created `POST /api/v1/webhooks/github` handling GitHub webhook payloads.
   - Exempted `/api/v1/webhooks/*` from JWT bearer authentication in `apps/gateway/src/middleware/jwt.ts`.
   - Filtered for default branch pushes (`refs/heads/main` or `master`) and merged PRs (`action === 'closed' && merged === true`).
   - Verified repository workspace existence in FalkorDB (returning 200 `{ ignored: true, reason: 'untracked_repository' }` for unindexed repos).
   - Created `(:IngestJob { type: 'incremental_sync', status: 'pending' })` and dispatched background execution asynchronously, responding with `202 Accepted` (`{ status: 'queued', deliveryId, jobId }`) in <50ms.

4. **Testing Suite:**
   - `apps/gateway/test/middleware/webhook-auth.test.ts`: 5 passing tests.
   - `apps/gateway/test/services/webhook-dedup.test.ts`: 5 passing tests.
   - `apps/gateway/test/routes/webhooks.test.ts`: 9 passing integration tests.

---

## Verification

```bash
pnpm --filter @argon/gateway test
# 10 test files passed (62 total tests)
```

## Threat Mitigations (ASVS L1)
- **T-08-01 (Spoofing/Tampering):** Validated HMAC signature rejecting forged requests with 401.
- **T-08-02 (Information Disclosure / Timing Attack):** Implemented `crypto.timingSafeEqual`.
- **T-08-03 (Replay / DoS):** In-memory LRU delivery deduplication returning 200 `{ deduplicated: true }`.
- **T-08-04 (Timeout DoS):** Immediate 202 Accepted response with decoupled async background execution.

