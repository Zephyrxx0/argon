---
phase: 07-authenticated-ingestion-private-repo-selector
plan: "01"
subsystem: ingest
tags: [git, redact, security, extraheader, canary-tests, falkordb, asvs-level-1]

# Dependency graph
requires:
  - phase: 06-authentication-multi-tenant-authorization
    provides: User authentication, JWT issuance, multi-tenant workspace isolation
provides:
  - Centralized secret redaction utility (`redactSecrets`, `sanitizeError`, `createSanitizedAuthError`)
  - Credential-free git transport via `-c http.extraheader="Authorization: Basic ..."`
  - `GIT_TERMINAL_PROMPT=0` to block subprocess hangs on private repo authentication failures
  - Redacted error tracking in FalkorDB `(:IngestJob.error)` and `(:IngestJob.repoUrl)`
  - Canary secret leak verification tests asserting zero leakages across errors, logs, and `.git/config`
affects: [07-02, 07-03, ingest, gateway]

actuals:
  tokens: 3800
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns: [http.extraheader git transport, ASVS Level 1 zero-leak canary verification, regex token scrubber]

key-files:
  created:
    - packages/ingest/src/git/redact.ts
    - packages/ingest/test/git/redact.test.ts
    - packages/ingest/test/git/clone-auth.test.ts
    - packages/ingest/test/git/canary-leak.test.ts
  modified:
    - packages/ingest/src/git/clone.ts
    - packages/ingest/src/git/types.ts
    - packages/ingest/src/pipeline.ts
    - packages/ingest/src/writer/falkordb.ts

key-decisions:
  - "Configured cloneRepository to use -c http.extraheader=Authorization: Basic <base64> and clean origin URLs, ensuring secrets never touch .git/config on disk"
  - "Added GIT_TERMINAL_PROMPT: '0' to git clone environment spawn options to prevent git from prompting on stdin during headless server execution"
  - "Sanitized all error strings and stack traces using centralized redactSecrets before persisting to FalkorDB or rethrowing"
  - "Mapped 401/403 git authentication errors to AUTH_FAILED_EXPIRED_OR_REVOKED for clear UX without leaking internals"

patterns-established:
  - "ASVS Level 1 Redaction: All GitHub App, PAT, and Basic/Bearer tokens are masked to [REDACTED_SECRET] everywhere in logs, exceptions, and DB"
  - "Canary Leak Invariance: Integration tests inject synthetic canary secrets and verify absence across process output, disk files, and database properties"

requirements-completed:
  - ING-05
  - ING-04

---

# Plan 07-01 Summary: Secret-Scrubbed Authenticated Ingestion Pipeline

## What Was Done
1. **Centralized Secret Redaction & Sanitization (`packages/ingest/src/git/redact.ts`)**:
   - Implemented regex patterns catching GitHub App tokens (`ghs_*`), user tokens (`ghp_*`, `gho_*`, `ghu_*`, `ghr_*`), fine-grained PATs (`github_pat_*`), HTTP authorization headers (`Bearer`, `Basic`), and URL-embedded credentials (`https://token@...`).
   - Created `redactSecrets`, `sanitizeError`, and `createSanitizedAuthError` returning structured, scrubbed errors.
   - Updated FalkorDB `updateJobStatus` in `packages/ingest/src/writer/falkordb.ts` to redact errors and repo URLs before persisting to the graph.

2. **Header-Based Git Clone Authentication (`packages/ingest/src/git/clone.ts`, `types.ts`, `pipeline.ts`)**:
   - Added `installationToken` to `CloneOptions` and `IngestPipelineConfig`.
   - Used `-c http.extraheader="Authorization: Basic <base64>"` so remote URLs remain pristine.
   - Configured `GIT_TERMINAL_PROMPT: '0'` in spawn options to fail immediately instead of blocking when credentials are rejected.

3. **Canary Leak & Security Verification Tests**:
   - `packages/ingest/test/git/redact.test.ts`: 8 unit tests covering all token variants and sanitization wrappers.
   - `packages/ingest/test/git/clone-auth.test.ts`: 2 integration tests verifying `-c http.extraheader` parameter injection and disk `.git/config` hygiene.
   - `packages/ingest/test/git/canary-leak.test.ts`: 3 leak-prevention tests asserting zero occurrences of canary secrets in exceptions, stdout/stderr streams, or on-disk git configuration.

## Verification
- Vitest run: `pnpm --filter @argon/ingest test` -> 7 test files passed, 32 passed, 1 skipped (FalkorDB integration test requiring live server).
- All canary leak assertions passed.
