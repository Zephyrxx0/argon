---
status: complete
phase: 07-authenticated-ingestion-private-repo-selector
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
started: "2026-10-16T16:15:00.000Z"
updated: "2026-10-16T16:20:00.000Z"
---

## Current Test

[testing complete]

## Tests

### 1. Token Sanitization & Regex Redaction (ING-05, D-06, D-07, T-07-01)
expected: Redaction utility cleans GitHub tokens (ghs_*, ghp_*, Bearer, x-access-token) from error messages, stack traces, and log strings, transforming errors to sanitized GitHubAuthError instances.
result: pass

### 2. Authenticated Git Clone via http.extraheader (ING-04, D-05, T-07-01)
expected: Git clone utilizes `-c http.extraheader` with base64 encoded Basic auth. Disk `.git/config` and remote URLs remain pristine HTTPS strings without embedded secrets.
result: pass

### 3. Canary Synthetic Token Zero-Leak Verification (ING-05, D-08, T-07-02)
expected: Synthetic canary tokens passed through simulated clone failures, stderr streams, and logger sinks are 100% redacted, leaving zero trace in error messages or logs.
result: pass

### 4. GitHub App Installation Token Generation & TTL Cache (ING-04, D-01, D-02, T-07-03)
expected: GitHubAppService generates installation tokens using `@octokit/auth-app` and caches them in memory with a 5-minute pre-expiry buffer, preventing redundant API calls.
result: pass

### 5. Dual-Authorization Installation Verification & Ingest Dispatch (ING-04, TENANT-02, D-04, T-07-04)
expected: Gateway verifies the calling user is an authorized member of the installation before granting access to repository lists or initiating ingestion; unauthorized callers receive 403 Forbidden.
result: pass

### 6. openCypher Author-to-User Identity Linking (TENANT-02, D-13, D-14)
expected: Mined commits establish `(:User)-[:IDENTIFIES]->(:Person)` edges matching verified emails, noreply aliases, or usernames without mutating immutable git `:Person` nodes.
result: pass

### 7. Searchable RepoPicker & Tabbed IngestModal (ING-04, D-09, D-10, D-11, D-12)
expected: IngestModal presents Radix tabs ('Your Repositories' and 'Public URL') with fuzzy search, org pills, visibility badges, and seamless ingestion progress dispatch.
result: pass

### 8. Contributor Identity Attribution & [YOU] Badges (TENANT-02, D-16)
expected: ContributorPicker and NodeInspector highlight the logged-in user with a high-contrast `[YOU]` badge, avatar, and verified link while displaying avatars for linked contributors.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

<!-- No gaps detected. All acceptance criteria automated and passed. -->

