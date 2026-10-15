---
status: complete
phase: 05-revert-backtest-showcase-corpus
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
started: "2026-10-16T01:22:00.000Z"
updated: "2026-10-16T01:23:00.000Z"
---

## Current Test

[testing complete]

## Tests

### 1. Evaluation Engine & Golden Fixtures Verification
expected: "@argon/eval exports strict Zod schemas, pure functional metrics (Recall@1/3/5, MRR, superseded hallucination rate), and parses 24 golden historical revert cases in fixtures/reverts.json."
result: pass
source: automated
details: "Ran `pnpm --filter @argon/eval test test/fixtures.test.ts test/metrics.test.ts` (13/13 unit tests passed)."

### 2. Temporal Graph Backtest Runner ($asOf Rewinding)
expected: "Evaluating historical revert fixtures via DirectGraphGatewayClient applies $asOf UTC epoch second rewinding on named Cypher query 05_constraining_decisions without graph mutation."
result: pass
source: automated
details: "Ran `pnpm --filter @argon/eval test test/backtest-runner.test.ts` (3/3 tests passed with parameter assertion & offline gateway gate)."

### 3. SHA-256 ReplayCache & Deterministic Fixtures
expected: "ReplayCache generates deterministic SHA-256 prompt hashes, supports disk persistence to fixtures/cache/llm-cache.json, and handles prompt matching for zero-cost test replays."
result: pass
source: automated
details: "Ran `pnpm --filter @argon/eval test test/replay-cache.test.ts` (5/5 unit tests passed)."

### 4. Dual No-Graph Baselines (Flat Vector Search & Raw LLM)
expected: "Baseline A executes cosine similarity over raw ADRs exposing superseded decision hallucinations; Baseline B prompt construction dumps full catalog into structured response parser."
result: pass
source: automated
details: "Ran `pnpm --filter @argon/eval test test/baseline-vector.test.ts test/baseline-llm.test.ts` (7/7 tests passed)."

### 5. Benchmark CLI & Comparative Reporting Subcommands
expected: "`bench:baseline` and `bench:compare` execute across 24 fixture cases and output colored ANSI tables, Markdown tables, and write eval-report.json."
result: pass
source: automated
details: "Executed `pnpm --filter @argon/eval bench:baseline` and `pnpm --filter @argon/eval bench:compare` successfully; eval-report.json generated."

### 6. Curated Triad Showcase Seed Datasets & Fast Cypher Seeder
expected: "Synthetic microservices (131KB), Ember RFCs (1.19MB), and Argon Dogfood (63KB) JSON files contain valid 512-d unit-norm float embeddings; seed.ts generates parameterized UNWIND batches."
result: pass
source: automated
details: "Ran `pnpm --filter @argon/eval test test/seed-synthetic.test.ts test/seed-showcase.test.ts` (7/7 tests passed)."

### 7. Automated Demo Smoke Test Script (`pnpm demo:check`)
expected: "scripts/demo-check.ts verifies 5 validation steps including DB connectivity, showcase seeds, scenario S1 briefing execution, 100% citation integrity, and kill-switch refusal on port 6399."
result: pass
source: automated
details: "Executed `DEMO_CHECK_MOCK=1 pnpm demo:check` passing all 5 automated checks with exit code 0."

### 8. Monorepo TypeScript & Complete Test Suite Health
expected: "Monorepo compiles with 0 TypeScript errors and all 106 tests across packages/eval, apps/web, apps/gateway, packages/agent, packages/graph, and packages/ingest pass cleanly."
result: pass
source: automated
details: "Ran `pnpm --filter @argon/eval typecheck` (0 errors) and `pnpm test` (106/106 tests passed across 8 packages)."

### 9. Hackathon Submission Suite & Publication-Ready Blog Post
expected: "Root README.md contains complete architecture diagrams, openCypher schema diagram, §7.4 compliance table, empirical benchmark table, and 2-min judge walkthrough; docs/BLOG-POST.md contains the technical publication article."
result: pass
source: automated
details: "Verified contents of README.md and docs/BLOG-POST.md; benchmark metrics synchronized with eval-report.json."

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
