---
phase: 05-revert-backtest-showcase-corpus
plan: "03"
subsystems:
  - evaluation
  - seeding
  - graph
tags:
  - evaluation
  - showcase
  - cypher
  - matryoshka
  - ember
  - microservices
requirements:
  - WS-01
  - EVAL-01
key_files:
  - packages/eval/fixtures/seeds/synthetic-microservices.json
  - packages/eval/fixtures/seeds/emberjs-rfcs.json
  - packages/eval/fixtures/seeds/argon-dogfood.json
  - packages/eval/src/seed.ts
  - packages/eval/src/cli.ts
  - root package.json
  - packages/eval/test/seed-synthetic.test.ts
  - packages/eval/test/seed-showcase.test.ts
metrics:
  tasks_completed: 2
  tests_added: 7
  total_eval_tests: 23
  total_repo_tests: 106
---

# Phase 05 Plan 03: Revert Backtest & Showcase Corpus - Seed Datasets & CLI Seeder Summary

## Executive Overview

Plan 05-03 has successfully generated the complete Curated Triad Corpus (`synthetic-demo`, `ember-adr-showcase`, `argon-dogfood`) bundling pre-calculated 512-dimension normalized Matryoshka float embeddings, created the high-performance parameterized openCypher batch seeder (`packages/eval/src/seed.ts`), and wired the root `pnpm seed:showcase` command into `packages/eval/src/cli.ts` and root `package.json`.

All showcase datasets load in under 5 seconds into FalkorDB without requiring live Hugging Face model downloads, API keys, or git network access, fulfilling requirements **WS-01** and **EVAL-01**.

---

## Completed Tasks

### Task 05-03-01: Synthetic Microservices showcase seed dataset and fast batch seeder (seed.ts)
- **Artifact:** `packages/eval/fixtures/seeds/synthetic-microservices.json` (131 KB)
  - Pre-computed dataset for `synthetic-demo` implementing the archetypal Billing/Auth/Sync storyline conforming to **D-12**.
  - Components: `billing`, `auth`, `sync`, `api-gateway`.
  - 18 files covering all microservice domain logic (`src/billing/retry.ts`, `src/billing/client.ts`, `src/auth/jwt.ts`, `src/sync/worker.ts`, `src/gateway/router.ts`, etc.).
  - 13 decisions with pre-computed 512-d unit vectors:
    - `DEC-001` ("Linear Retry with Static Backoff", superseded) -> `DEC-002` ("Exponential Backoff with Full Jitter", active) supersession chain directly supporting scenario S1-S3 cards.
    - `DEC-003` -> `DEC-004` (Auth 15-minute RS256 JWT rotation).
    - `DEC-005` -> `DEC-006` (Sync failure quarantine protocol).
    - `DEC-007` -> `DEC-008` (Gateway adaptive buffer timeout).
    - `DEC-012` -> `DEC-013` (Gateway distributed Redis rate limiting).
    - Standalone active governance: `DEC-009` (optimistic locking), `DEC-010` (mTLS RPC), `DEC-011` (sync gzip compression).
  - 8 Reverts including Revert #42 (Retry Storm incident #1042), Revert #58 (session storage), Revert #71 (unbounded queue), etc.
- **Seeder Engine:** `packages/eval/src/seed.ts`
  - Implements `seedWorkspace` and `seedAllShowcaseWorkspaces` using parameterized openCypher `UNWIND` batches.
  - Injects decision embeddings via `vecf32(d.embedding)`.
  - Validates ASVS Level 1 controls: T-05-07 (parameterized queries, no string concatenation), T-05-08 (512-d vector validation), T-05-09 (graph cleanup with `MATCH (n) DETACH DELETE n`).
- **Test:** `packages/eval/test/seed-synthetic.test.ts`
  - Validates schema, vector dimensions, and supersession links offline; runs live FalkorDB graph integration when DB is available.
- **Commit:** `12ad786` (`feat(eval): add synthetic microservices seed dataset and batch seeder`)

### Task 05-03-02: Ember RFC and Argon Dogfood seed datasets and wired `pnpm seed:showcase`
- **Artifacts:**
  - `packages/eval/fixtures/seeds/emberjs-rfcs.json` (1.19 MB):
    - `workspaceId: "ember-adr-showcase"` conforming to **D-09** and **D-11**.
    - 112 real-world Ember.js RFCs (Glimmer components, autotracking metal runtime, RouterService, RecordData, Embroider V2 asset pipeline, decorators).
    - Pre-calculated 512-d unit vectors for all 112 RFCs.
    - 320 PRs/commits representing bounded historical window (300-500 commits) keeping total size < 10MB.
    - Historical supersession chains (RFC-0496 superseding RFC-0278, RFC-0410 superseding RFC-0213, RFC-0391 superseding RFC-0095, RFC-0465 superseding RFC-0293, RFC-0779 superseding RFC-0454, RFC-0630 superseding RFC-0311, RFC-0316 superseding RFC-0143).
    - 10 real historical reverts matching cases REV-009 to REV-018 in `reverts.json`.
  - `packages/eval/fixtures/seeds/argon-dogfood.json` (63 KB):
    - `workspaceId: "argon-dogfood"` conforming to **D-09**.
    - Models Argon's own monorepo architecture: `packages/graph`, `packages/ingest`, `packages/agent`, `apps/web`, `packages/eval`.
    - 6 Dogfood ADRs (`ADR-001` through `ADR-006`) with 512-d embeddings.
    - Developer contributor Person nodes (`P-001`, `P-002`, `P-003`), `[:AUTHORED]` edges, and cross-package `[:DEPENDS_ON]` edges.
    - 6 historical reverts matching cases REV-019 to REV-024 in `reverts.json`.
- **CLI & Root Scripts:**
  - Added `seed` subcommand to `packages/eval/src/cli.ts` invoking `seedAllShowcaseWorkspaces`.
  - Added `"seed": "tsx src/cli.ts seed"` to `packages/eval/package.json`.
  - Added `"seed:showcase": "pnpm --filter @argon/eval seed"` to root `package.json` conforming to **D-10**.
- **Test:** `packages/eval/test/seed-showcase.test.ts`
  - Validates schema and invariants across all 3 seed datasets.
  - Verifies all decisions have length 512 float arrays with unit norm.
  - Asserts bounded file sizes (<10MB) and integration performance (<5 seconds).
- **Commit:** `d3cf226` (`feat(eval): add Ember RFC and Argon Dogfood seed datasets and wire seed:showcase`)

---

## Verification & Test Results

```bash
$ pnpm --filter @argon/eval test
 ✓ test/fixtures.test.ts (5 tests)
 ✓ test/metrics.test.ts (8 tests)
 ✓ test/seed-synthetic.test.ts (2 tests)
 ✓ test/backtest-runner.test.ts (3 tests)
 ✓ test/seed-showcase.test.ts (5 tests)
 Test Files  5 passed (5)
      Tests  23 passed (23)

$ pnpm seed:showcase --help
Usage: argon-eval seed [options]
Seed all curated showcase workspaces into FalkorDB
Options:
  -d, --dir <path>  Custom seeds directory
  -h, --help        display help for command

$ pnpm test
 Tasks:    8 successful, 8 total (106 tests passed across monorepo)
```

---

## Threat Model Compliance Summary

| Threat ID | Mitigation Implemented | Status |
|---|---|---|
| **T-05-07** | Parameterized Cypher `$batch` with `UNWIND` for all node and edge insertions. No string interpolation. | **Verified** |
| **T-05-08** | Pre-flight validation ensuring every decision embedding is an array of exactly 512 numbers with unit L2 norm. | **Verified** |
| **T-05-09** | Graph isolation by workspace ID and clean `MATCH (n) DETACH DELETE n` before seeding fresh showcase data. | **Verified** |
