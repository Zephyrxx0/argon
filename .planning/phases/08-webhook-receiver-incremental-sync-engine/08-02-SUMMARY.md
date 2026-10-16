# Plan 08-02 Summary: Incremental Git Mutation, Rolling Co-Change & ADR Supersession Engine

**Execution Wave:** Wave 2  
**Requirements Addressed:** `SYNC-02`, `SYNC-03`  
**Status:** Completed  

---

## 1. Accomplishments

### OpenCypher Parameterized Incremental Sync Queries (`@argon/graph`)
- Created `packages/graph/src/queries/sync.ts` implementing parameterized Cypher queries:
  - `INCREMENTAL_SYNC_COMMITS_QUERY`: Atomically ingests commit metadata (`:Person`, `:Commit`, `:File`, `[:AUTHORED]`, `[:TOUCHES]`, `[:IN_WORKSPACE]`) from push webhook payloads with unwound arrays, avoiding full git repository re-cloning.
  - `LINK_REVERT_COMMIT_QUERY`: Mines `This reverts commit <sha>` signatures and establishes directed `(:Commit)-[:REVERTS]->(:Commit)` edges.
  - `UPDATE_ROLLING_COUPLING_QUERY`: Incrementally increments co-change counts and dynamically recalculates weights `round((count * 1.0) / (count + 5) * 100) / 100` on `[:CO_CHANGES_WITH]` edges between file pairs.
  - `ADVANCE_ADR_SUPERSEDED_QUERY`: Sets `old.valid_to = $mergedAt`, `old.status = 'superseded'`, `new.valid_from = $mergedAt`, and merges `(new:Decision)-[:SUPERSEDES]->(old:Decision)`.
  - `UPSERT_DECISION_QUERY`: Upserts `(:Decision)` nodes with properties (`title`, `problem`, `decision`, `status`, `valid_from`, `valid_to`, `embedding`) and links `[:GOVERNS]` relationships to touched code files.
- Exported query string constants and execution helpers in `packages/graph/src/queries/index.ts` and `packages/graph/src/index.ts`.
- Validated with unit tests in `packages/graph/test/queries/sync.test.ts` (6/6 tests passing).

### Incremental Sync Service (`@argon/gateway`)
- Created `apps/gateway/src/services/incremental-sync.ts` (`IncrementalSyncService`):
  - **Push Event Processing (`processPushSync`)**:
    - Unpacks `payload.commits`, redacting secrets and extracting author email/name and modified/added/removed files.
    - Sets `deleted: true, deleted_at = timestamp` for removed files while preserving historical graph lineage.
    - Enforces churn cap ($\le 50$ touched files) before generating pairwise co-change updates, preventing megacommit refactoring churn from inflating blast radius metrics.
    - Detects git revert commits matching `This reverts commit ([a-f0-9]{7,40})` and creates `[:REVERTS]` edges.
  - **Pull Request Processing (`processPullRequestSync`)**:
    - Verifies closed merged PRs (`payload.action === 'closed' && payload.pull_request?.merged`).
    - Uses Octokit to inspect changed files, filtering for ADR paths (`docs/adr/`, `docs/decisions/`, `*.adr.md`).
    - Fetches raw ADR content at the PR merge commit sha, parses ADR sections using `parseAdrDocument` from `@argon/ingest`.
    - Computes 512-dimensional vector embeddings on CPU via `ArgonEmbedder` (`EmbeddingGemma-2`).
    - Links governed files (explicitly referenced files in ADR markdown, or fallback to PR touched code files).
    - If the ADR supersedes an existing decision, advances temporal validity window (`old.valid_to = pr.merged_at`, `new.valid_from = pr.merged_at`) and creates `[:SUPERSEDES]` relationship.
  - Tested in `apps/gateway/test/services/incremental-sync.test.ts` (8/8 tests passing).

### Integration & Dependency Wiring
- Added `@argon/ingest` workspace dependency to `apps/gateway/package.json`.
- Added `getInstallationOctokit` convenience helper on `GitHubAppService`.
- Wired `IncrementalSyncService` into `apps/gateway/src/app.ts` as the default sync runner for `SyncOrchestrator`.
- Replaced `GIT_TERMINAL_PROMPT` configuration in `cloneRepository` with single env call `simpleGit().env('GIT_TERMINAL_PROMPT', '0')` to avoid `simple-git` unsafe environment errors (`allowUnsafePager` / `allowUnsafeEditor`).

---

## 2. Verification

- `@argon/graph`: All 5 test suites (37 passing, 14 skipped) pass (`pnpm --filter @argon/graph test`).
- `@argon/ingest`: All 9 test suites (35 passing, 1 skipped) pass (`pnpm --filter @argon/ingest test`).
- `@argon/gateway`: All 11 test suites (70 passing) pass (`pnpm --filter @argon/gateway test`).
- Type check: Clean build across `@argon/graph`, `@argon/ingest`, and `@argon/gateway`.

---

## 3. Next Steps (Wave 3 — Plan 08-03)
- Implement SSE event streaming endpoint `GET /api/v1/workspaces/:workspaceId/events` in `@argon/gateway`.
- Emit `sync:complete` events containing updated commit, file, and decision IDs.
- Implement web client listener (`apps/web/lib/events-client.ts`, `apps/web/lib/graph-sync.tsx`).
- Add Cytoscape canvas pulse animation for synced nodes and dashed border style for superseded ADR nodes.
- Add HUD sync badge and active briefing stale alert banner.
