---
phase: 6
slug: authentication-multi-tenant-authorization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-16
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.0 |
| **Config file** | `apps/web/vitest.config.ts`, `apps/gateway/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web test run && pnpm --filter gateway test run` |
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
| 06-01-01 | 01 | 1 | AUTH-01 | T-06-01 | Encrypted stateless cookie session issuance & Better Auth client setup | unit | `pnpm --filter web test run tests/auth/auth-server.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | AUTH-02 | T-06-02 | Anonymous plugin guest session issuance with isAnonymous: true | unit | `pnpm --filter web test run tests/auth/anonymous-session.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 2 | AUTH-01 | T-06-03 | HeaderBar user avatar, guest indicator pill, and sign-in modal triggers | component | `pnpm --filter web test run tests/components/header-bar-auth.test.tsx` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | TENANT-01 | T-06-04 | FalkorDB schema adds :User and [:ACCESSES] with openCypher constraints | integration | `pnpm --filter @argon/graph test run tests/schema/tenant-schema.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | TENANT-01 | T-06-05 | Gateway JWT middleware decodes and verifies HS256 tokens for users and guests | unit | `pnpm --filter gateway test run tests/middleware/jwt-auth.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | TENANT-01 | T-06-06 | Pre-query Cypher guard blocks unauthorized private workspace access with 403 Forbidden | integration | `pnpm --filter gateway test run tests/middleware/tenant-guard.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | AUTH-02 | T-06-07 | Better Auth account linking migrates guest [:ACCESSES] edges to authenticated user | integration | `pnpm --filter web test run tests/auth/account-linking.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/tests/auth/auth-server.test.ts` — Better Auth server setup tests
- [ ] `apps/web/tests/auth/anonymous-session.test.ts` — Anonymous plugin session tests
- [ ] `apps/gateway/tests/middleware/jwt-auth.test.ts` — Gateway JWT verification tests
- [ ] `apps/gateway/tests/middleware/tenant-guard.test.ts` — Gateway tenant isolation 403/404 tests
- [ ] `packages/graph/tests/schema/tenant-schema.test.ts` — FalkorDB :User schema tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub OAuth Redirect Loop Check | AUTH-01 | Requires active GitHub OAuth app client credentials | Open `apps/web`, click Sign In with GitHub in modal dialog, verify redirection to GitHub and callback |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-16
