---
phase: 01-database-schema-vector-foundation
plan: "02"
subsystem: database
tags: [falkordb, opencypher, vector-index, typescript, vitest, graph-schema]

requires:
  - 01-01-monorepo-foundation-scaffolding

provides:
  - ArgonGraphClient wrapper with connection pooling, 5000ms timeouts, and roQuery safety
  - FalkorUnavailableError exception class powering "no graph, no answer" refusal contract
  - schema.cypher reference DDL defining 8 core node labels, 12 relationship types, and 512-d vector index
  - initWorkspaceGraph programmatic idempotent schema initializer
  - CLI schema migration tool (pnpm --filter @argon/graph db:schema:apply)
  - Vitest integration and offline refusal test suite (packages/graph/test/schema.test.ts)

affects:
  - 01-database-schema-vector-foundation
  - 02-ingestion-pipeline-decision-mining
  - 03-query-gateway-briefing-pipeline
  - 04-nextjs-frontend-graph-canvas

actuals:
  tokens: 2200
  tasks: 4
  commits: 4

tech-stack:
  added:
    - falkordb: ^6.8.0
    - "@huggingface/transformers": ^4.3.1
    - "@google/genai": ^2.30.0
    - zod: ^3.24.2
    - dotenv: ^16.4.7
    - vitest: ^3.2.0
    - tsx: ^4.19.3
  patterns:
    - RESP 2 FalkorDB driver connection management
    - Typed failure refusal via FalkorUnavailableError ("no graph, no answer")
    - Strict read-only query dispatch via roQuery
    - Idempotent graph schema initialization (range indexes, constraints, 512-d cosine vector index)
    - Dynamic reachability probing for graceful test skipping when database container is offline

key-files:
  created:
    - packages/graph/package.json
    - packages/graph/tsconfig.json
    - packages/graph/vitest.config.ts
    - packages/graph/test/setup.ts
    - packages/graph/src/client.ts
    - packages/graph/src/schema/schema.cypher
    - packages/graph/src/schema/init.ts
    - packages/graph/src/schema/apply.ts
    - packages/graph/src/index.ts
    - packages/graph/test/schema.test.ts

key-decisions:
  - "D-05: Connected to FalkorDB over RESP 2 via official falkordb client"
  - "D-07: Idempotent schema initialization via initWorkspaceGraph handling duplicate range/vector indexes and constraints"
  - "D-08: ArgonGraphClient enforcing 5000ms query timeouts, typed FalkorUnavailableError refusal contract, and roQuery read-only dispatch"
  - "PRD §7.1-7.5: 8 core node labels, 12 relationship types, and 512-dimensional cosine vector index on Decision.embedding"

patterns-established:
  - "Refusal contract: unhandled disconnects or missing database throw FalkorUnavailableError with [NO GRAPH, NO ANSWER] prefix"
  - "Idempotent DDL: duplicate index/constraint errors are safely caught and ignored"
  - "Graceful test harness: tests verify offline/refusal invariants unconditionally and probe reachability before executing live FalkorDB queries"

requirements-completed:
  - GRAPH-01

coverage:
  - id: D5
    description: "ArgonGraphClient FalkorDB connection and roQuery safety"
    requirement: GRAPH-01
    verification:
      - kind: automated_test
        ref: "packages/graph/test/schema.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Idempotent initWorkspaceGraph schema initializer with 512-d vector index"
    requirement: GRAPH-01
    verification:
      - kind: automated_test
        ref: "packages/graph/test/schema.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "FalkorUnavailableError refusal exception on unreachable host or unconnected operations"
    requirement: GRAPH-01
    verification:
      - kind: automated_test
        ref: "packages/graph/test/schema.test.ts"
        status: pass
    human_judgment: false

duration: 12m
completed: 2026-10-15
status: complete
---

# Phase 01 Plan 02: Database Client & Schema Foundation Summary

**Implemented `ArgonGraphClient` with 5000ms query timeouts, typed `FalkorUnavailableError` ("no graph, no answer" refusal contract), and `roQuery` safety. Authored `schema.cypher` and implemented idempotent `initWorkspaceGraph` with 512-d cosine vector index, CLI migration tool, and integration tests.**

## Performance

- **Duration:** 12m
- **Started:** 2026-10-15T12:31:00Z
- **Completed:** 2026-10-15T12:43:00Z
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments

- Scaffolded `@argon/graph` package with dependencies (`falkordb`, `@huggingface/transformers`, `@google/genai`, `zod`, `dotenv`), TypeScript configuration extending `@argon/tsconfig/node.json`, and Vitest configuration with 60000ms test timeout.
- Implemented `ArgonGraphClient` and `FalkorUnavailableError` in `packages/graph/src/client.ts` enforcing connection pooling, 5000ms timeouts, and strict `roQuery` read dispatch.
- Authored reference `schema.cypher` covering 8 node labels (`Person`, `Component`, `File`, `PullRequest`, `Issue`, `Decision`, `Briefing`, `IngestJob`), 12 relationship types, uniqueness constraints, range indexes, and the 512-d cosine vector index on `Decision.embedding`.
- Implemented `initWorkspaceGraph` in `packages/graph/src/schema/init.ts` providing idempotent schema application without throwing on pre-existing indexes or constraints.
- Created CLI migration command `packages/graph/src/schema/apply.ts` runnable via `pnpm --filter @argon/graph db:schema:apply [workspaceId]`.
- Authored integration test suite in `packages/graph/test/schema.test.ts` verifying offline refusal invariants, error messages, and idempotent schema application against FalkorDB.

## Task Commits

Each task was committed atomically:

1. **Task 1: Setup packages/graph structure, dependencies, tsconfig, and vitest configuration** - `eb41823` (feat)
2. **Task 2: Implement ArgonGraphClient with 5000ms timeout, typed FalkorUnavailableError, and roQuery safety** - `609e4cd` (feat)
3. **Task 3: Author schema.cypher and implement idempotent initWorkspaceGraph with 512-d vector index** - `a4cc68b` (feat)
4. **Task 4: Create integration test verifying client connection, timeouts, idempotency, and refusal states** - `12268ea` (test)

## Files Created/Modified

- `packages/graph/package.json` - Package manifest for `@argon/graph`
- `packages/graph/tsconfig.json` - TypeScript configuration extending `@argon/tsconfig/node.json`
- `packages/graph/vitest.config.ts` - Vitest test configuration with node environment and testTimeout 60s
- `packages/graph/test/setup.ts` - Test environment configuration and .env loading
- `packages/graph/src/client.ts` - `ArgonGraphClient` class and `FalkorUnavailableError`
- `packages/graph/src/schema/schema.cypher` - FalkorDB DDL reference schema and 512-d vector index
- `packages/graph/src/schema/init.ts` - Programmatic idempotent `initWorkspaceGraph` function
- `packages/graph/src/schema/apply.ts` - CLI entrypoint for workspace graph schema initialization
- `packages/graph/src/index.ts` - Package entrypoint exporting client, refusal error, and schema init
- `packages/graph/test/schema.test.ts` - Integration tests asserting refusal invariants and idempotent initialization

## Decisions Made

- Conformed to D-05, D-07, D-08, and PRD §7.1-7.5:
  - Official `falkordb` npm package used with RESP 2.
  - Queries default to 5000ms timeout with `TIMEOUT` parameter.
  - Connection/socket failures thrown as `FalkorUnavailableError` with `[NO GRAPH, NO ANSWER]` prefix.
  - Read-only operations routed through `roQuery`.
  - 512-d cosine vector index configured on `(d:Decision).embedding`.
  - Allowed builds for native modules (`@google/genai`, `onnxruntime-node`, `sharp`, `esbuild`, `protobufjs`) configured in `pnpm-workspace.yaml`.

## Deviations from Plan

None - plan executed exactly as specified.

## Issues Encountered

- `pnpm` v12 gated native build scripts (`ERR_PNPM_IGNORED_BUILDS`); resolved by setting `allowBuilds: true` in `pnpm-workspace.yaml`.
- TypeScript strict mode required `override` keyword on `Error.cause` property in `FalkorUnavailableError`; resolved cleanly.

## User Setup Required

When running integration tests against a live database, start FalkorDB with `pnpm db:up`. When FalkorDB is offline, tests safely skip live queries while strictly validating all offline and refusal invariants.
