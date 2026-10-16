# Phase 01 Plan 03: 8 Named Cypher Queries, Cytoscape Serializer & Integration Suite Summary

**Plan ID:** 01-03  
**Phase:** 01-database-schema-vector-foundation  
**Status:** Completed  
**Execution Date:** 2026-10-15  

## Objective Overview

Authored the 8 core openCypher named queries as standalone `.cypher` files, defined strict runtime Zod input/output schemas with inferred TypeScript types, built a deduplicating Cytoscape element transformer outputting normalized dual-payloads (`{ raw, graph, evidence }`), implemented typed query dispatchers running exclusively via `roQuery`, and verified query and transformer behaviors with a deterministic fixture and Vitest test suite.

## Delivered Artifacts

### 1. Standalone openCypher Named Queries (`packages/graph/queries/`)
- `01_resolve_scope.cypher`: Resolves input file paths and component names to existing graph entities.
- `02_blast_radius.cypher`: Variable-length dependency path traversal (`[:DEPENDS_ON*1..3]`) downstream from touched files.
- `03_risk_ranking.cypher`: Computes native FalkorDB PageRank (`algo.pageRank('Component', 'DEPENDS_ON')`) to rank critical architectural bottlenecks.
- `04_who_knows.cypher`: Aggregates PR authorship (`AUTHORED`) and review activity (`REVIEWED`) per component.
- `05_constraining_decisions.cypher`: Evaluates temporal validity of architecture decisions (`valid_from <= $asOf AND (valid_to IS NULL OR valid_to > $asOf)`).
- `06_precedent_search.cypher`: Executes 512-d vector similarity search (`db.idx.vector.queryNodes('Decision', 'embedding', $limit, vecf32($queryVector))`) with graph expansion to governed components and source PRs.
- `07_path_between.cypher`: Computes shortest dependency path between components via FalkorDB `algo.SPpaths`.
- `08_component_overview.cypher`: Aggregates file counts, governed decisions, and connected dependency names for a component.

### 2. Zod Contracts & Inferred Types (`packages/graph/src/queries/types.ts`)
- Parameter & result schemas for all 8 queries: `ResolveScopeParamsSchema`, `ResolveScopeResultSchema`, `BlastRadiusParamsSchema`, `BlastRadiusResultSchema`, `RiskRankingParamsSchema`, `RiskRankingResultSchema`, `WhoKnowsParamsSchema`, `WhoKnowsResultSchema`, `ConstrainingDecisionsParamsSchema`, `ConstrainingDecisionsResultSchema`, `PrecedentSearchParamsSchema` (strictly enforcing 512-dimension vectors), `PrecedentSearchResultSchema`, `PathBetweenParamsSchema`, `PathBetweenResultSchema`, `ComponentOverviewParamsSchema`, `ComponentOverviewResultSchema`.
- Cytoscape serialization interfaces: `CytoscapeNodeData`, `CytoscapeEdgeData`, `CytoscapeElements`, and `DualPayload<T>`.

### 3. Deduplicating Cytoscape Transformer (`packages/graph/src/transformers/cytoscape.ts`)
- `toCytoscapeElements<T>(rawRecords: T): DualPayload<T>`:
  - Traverses nested records, FalkorDB Nodes, Edges, and Paths.
  - Maintains `seenNodeIds: Set<string>` and `seenEdgeIds: Set<string>` to prevent duplicate ID crashes in Cytoscape.js.
  - Normalizes canonical IDs and human-readable display labels across node types (`File`, `Component`, `Decision`, `Person`, `PullRequest`).
  - Synthesizes fallback endpoint nodes for orphan edge references so Cytoscape never crashes on non-existent endpoints.
  - Supports tabular query outputs (e.g. `constrainingDecisions`, `componentOverview`, `whoKnows`, `riskRanking`) creating proper graph nodes and edges.
  - Returns `{ raw, graph: { nodes, edges }, evidence: { nodeCount, edgeCount, primaryIds } }`.

### 4. Typed Query Dispatchers (`packages/graph/src/queries/index.ts`)
- Query file loader resolving `.cypher` files from disk with embedded inline fallback.
- Exported typed functions: `resolveScope`, `blastRadius`, `riskRanking`, `whoKnows`, `constrainingDecisions`, `precedentSearch`, `pathBetween`, `componentOverview`.
- All read queries strictly execute via `client.roQuery()` to guarantee read-only execution at the database level.

### 5. Deterministic Fixture & Integration Test Suite (`packages/graph/test/`)
- `packages/graph/test/seed-fixture.ts`:
  - `seedTestGraph(client, workspaceId)`: Drops existing nodes, applies idempotent schema constraints and 512-d vector index, and creates a deterministic synthetic graph with files, components, decisions, PRs, and 512-d unit vectors.
- `packages/graph/test/queries.test.ts`:
  - Offline test suite asserting parameter validations across all 8 queries and extensive Cytoscape deduplication and normalization scenarios.
  - Live FalkorDB query suite probe-guarded with `isFalkorLive` asserting exact results for all 8 named queries.

## Verification

- `pnpm --filter @argon/graph typecheck`: Clean (0 errors).
- `pnpm turbo run typecheck test`: 4/4 tasks passing across `@argon/graph` and `web`.
- Offline contracts & Cytoscape deduplication test suite passed (15 passed tests, 11 skipped when FalkorDB daemon is offline).

## Commits

- `feat(01-03): author 8 named cypher queries and zod schemas`
- `feat(01-03): implement deduplicating cytoscape transformer`
- `feat(01-03): build typed query runners and integration test suite`
