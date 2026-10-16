---
phase: 7
slug: authenticated-ingestion-private-repo-selector
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-16
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/gateway/vitest.config.ts`, `packages/ingest/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @argon/ingest test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @argon/ingest test` (or package-specific test command)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | ING-05 | T-07-01 | Tokens sanitized across all loggers and errors | unit | `pnpm --filter @argon/ingest test test/git/redact.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | ING-04 | T-07-01 | SimpleGit clones with clean URL via http.extraheader | integration | `pnpm --filter @argon/ingest test test/git/clone-auth.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | ING-05 | T-07-02 | Canary synthetic token never leaks to stdout/stderr/error | integration | `pnpm --filter @argon/ingest test test/git/canary-leak.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | ING-04 | T-07-03 | GitHub App installation token generation with TTL cache | unit | `pnpm --filter @argon/gateway test test/services/github-app.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | ING-04 | T-07-04 | Dual authorization validates user belongs to installation | integration | `pnpm --filter @argon/gateway test test/routes/github-repos.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | TENANT-02 | T-07-05 | Cypher query merges (:User)-[:IDENTIFIES]->(:Person) | integration | `pnpm --filter @argon/ingest test test/writer/identity-linking.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 1 | ING-04 | N/A | IngestModal tabs & repository picker list | component | `pnpm --filter web test tests/components/ingest-modal-picker.test.tsx` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 2 | TENANT-02 | N/A | ContributorPicker & NodeInspector render [YOU] and verified badge | component | `pnpm --filter web test tests/components/contributor-identity.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ingest/test/git/redact.test.ts` — test stubs for ING-05 secret scrubbing
- [ ] `packages/ingest/test/git/clone-auth.test.ts` — test stubs for authenticated git clone
- [ ] `packages/ingest/test/git/canary-leak.test.ts` — canary token leak assertion stubs
- [ ] `apps/gateway/test/services/github-app.test.ts` — Octokit App auth stubs
- [ ] `apps/gateway/test/routes/github-repos.test.ts` — installation repository route stubs
- [ ] `packages/ingest/test/writer/identity-linking.test.ts` — graph writer identity linking stubs
- [ ] `apps/web/tests/components/ingest-modal-picker.test.tsx` — IngestModal picker component stubs
- [ ] `apps/web/tests/components/contributor-identity.test.tsx` — Contributor badge component stubs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real GitHub App Installation Flow | ING-04 | Requires live GitHub App redirection to github.com | Click "Install GitHub App", verify GitHub installation page opens with correct client id |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
