# Phase 5 Plan 1: Evaluation Package Foundation, Golden Fixtures & Graph Backtest Runner Summary

**Executed:** 2026-10-16
**Status:** Complete
**Plan:** `05-01-PLAN.md`

## What Was Built
1. **Scaffolded `@argon/eval` Package:**
   - Standalone ESM workspace package (`@argon/eval`) in `packages/eval` with dependencies on `@argon/graph`, `@argon/agent`, `commander`, `cli-table3`, `picocolors`, `zod`, and `dotenv` conforming to D-08.
   - Configured `tsconfig.json` extending `@argon/tsconfig/node.json`, `vitest.config.ts` (20-second timeout, `test/setup.ts`), and linked into root pnpm workspace.
   - Implemented strict Zod schemas and inferred TypeScript types in `src/types.ts` (`RevertFixtureItemSchema`, `EvaluationMethodSchema`, `CaseResultSchema`, `MethodSummarySchema`), strictly enforcing UTC epoch seconds (`max(2500000000)`) per T-05-03, traversal-free relative paths per T-05-02, and non-empty ground truth decision IDs per D-01.

2. **Pure Functional Metrics Engine & Golden Fixtures:**
   - Created `src/metrics/calculator.ts` with `calculateCaseResult` and `calculateSummary`, computing Recall@1, Recall@3, Recall@5, MRR (Mean Reciprocal Rank), Superseded Hallucination Rate, and average latency conforming to D-01 and D-02. Safe handling of empty result arrays preventing NaN or division by zero.
   - Curated 24 golden fixture items in `fixtures/reverts.json` across three showcase workspaces conforming to D-04 and D-12:
     - 8 synthetic microservice cases (`synthetic-demo`): including Revert #42 (linear retry loop rollback vs DEC-002 exponential jitter), JWT lifetime bypass, sync queue bypass, gateway timeouts, mTLS validation, and distributed rate limiting.
     - 10 real-world Ember RFC cases (`ember-adr-showcase`): Glimmer template-only components (RFC-0496), tracked properties autotracking (RFC-0410), router transition hooks (RFC-0391), Ember Data RecordData (RFC-0465), template strict mode (RFC-0779), etc.
     - 6 Argon dogfood cases (`argon-dogfood`): monorepo boundaries (ADR-001), 512-d Matryoshka dimension truncation (ADR-002), strict fail-closed citation verification (ADR-003), query parameterization (ADR-004), client reconnect backoff (ADR-005), and Cytoscape ID formatting (ADR-006).

3. **Temporal Graph Backtest Runner & CLI Command:**
   - Implemented `evaluateGraphCase` and `runGraphBacktest` in `src/runner/graph-runner.ts`, querying FalkorDB via `DirectGraphGatewayClient.executeQuery` using named query `constrainingDecisions` with `$asOf` UTC epoch second predicate rewinding without mutating or rebuilding the graph database per D-03.
   - Implemented `argon-eval` CLI executable with `bench:graph` subcommand in `src/cli.ts` supporting `--workspace <id>` filtering, formatted Unicode terminal table rendering via `cli-table3` and `picocolors`.
   - Written integration and unit tests in `test/backtest-runner.test.ts` verifying parameter delegation and live FalkorDB temporal rewinding (with graceful offline skip gate).

## Verification
- `pnpm --filter @argon/eval typecheck`: passed cleanly (0 errors).
- `pnpm --filter @argon/eval test test/metrics.test.ts test/fixtures.test.ts`: passed (13 tests passed).
- `pnpm --filter @argon/eval test test/backtest-runner.test.ts`: passed (3 tests passed).
- Total `@argon/eval` test suite: 16 tests passed across 3 test files.
