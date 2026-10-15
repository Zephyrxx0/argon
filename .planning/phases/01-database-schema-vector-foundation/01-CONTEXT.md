# Phase 1: Database Schema & Vector Foundation - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the monorepo foundation (`pnpm` + Turborepo), scaffold `apps/web` (Next.js 15 App Router, Tailwind v4, brutalist tokens) and `packages/graph`, author the FalkorDB openCypher schema (`schema.cypher`) with 512-d vector index, implement all 8 parameterized named queries with typed Zod contracts and Cytoscape transforms, verify local Transformers.js Node.js CPU embedding generation with Matryoshka 512-d L2 re-normalization and Gemini API fallback, and validate everything against a local FalkorDB Docker test container.

In scope:
- pnpm workspace + Turborepo configuration with shared TypeScript configs
- `apps/web` scaffolding (Next.js 15 App Router, Tailwind v4, dark brutalist tokens, shadcn base)
- Root `docker-compose.yml` for FalkorDB with healthcheck and `pnpm db:up`
- `packages/graph` client with `ArgonGraphClient`, 5s query timeouts, `RO_QUERY` safety, and "no graph, no answer" refusal handling
- `schema.cypher` with node constraints, relationship types, and 512-d vector index
- Programmatic idempotent schema initializer (`initWorkspaceGraph(workspaceId)`) and CLI command
- 8 parameterized named queries in `.cypher` files with Zod parameter and result validation
- Query result transformer providing normalized `{ raw, graph: CytoscapeElements, evidence }` output
- Local Transformers.js embedder (`onnx-community/embeddinggemma-2` q8, Matryoshka 512-d, L2 norm = 1.0) with `.cache/models/` path
- Transparent fallback to Gemini API (`text-embedding-004`) configurable via `EMBEDDING_PROVIDER`
- Vitest suite with deterministic synthetic fixture graph verifying all 8 queries and mathematical embedding assertions

Out of scope:
- Repository cloning, co-change mining, or git ingest workers (Phase 2)
- Hono gateway HTTP service and agent narration (Phase 3)
- Full interactive UI command bar and Cytoscape canvas integration (Phase 4)
- Git revert backtest and showcase corpus ingestion (Phase 5)
</domain>

<decisions>
## Implementation Decisions

### Monorepo & Next.js App Setup
- **D-01:** Monorepo orchestrated with Turborepo + pnpm workspaces with shared tsconfig/eslint for task caching and unified dev/build pipelines. — **Reversibility:** costly — Repository tooling refactoring touches all package scripts, root configs, and CI pipelines.
- **D-02:** Scaffold `apps/web` in Phase 1 with Next.js 15 (App Router), Tailwind CSS v4, and shadcn base to verify cross-package workspace imports and TypeScript resolution from day one. — **Reversibility:** costly — Changes frontend workspace package boundaries and initial app directory structure.
- **D-03:** Internal packages (`packages/graph`, `packages/common`) consumed directly via TypeScript sources (`transpilePackages` in Next.js, `tsx` in Node.js) with no intermediate build/dist step required for local dev. — **Reversibility:** reversible — Build scripts can be introduced via tsup if separate compilation artifacts are required later.
- **D-04:** Pre-configure dark mode cyberpunk brutalist tokens in Tailwind CSS v4 + lucide-react in `apps/web` to establish the terminal visual language specified in PRD §6.4. — **Reversibility:** reversible — Styling tokens are CSS variables in globals.css.

### FalkorDB Driver & Test Harness
- **D-05:** Use the official `falkordb` npm client for graph connection, graph-per-workspace selection (`db.selectGraph(workspaceId)`), native record parsing, and vector indexing. — **Reversibility:** costly — Switching driver requires rewriting graph connection wrappers and query execution methods.
- **D-06:** Provision local FalkorDB via root `docker-compose.yml` (port 6379, persistent volume) with a `pnpm db:up` command and container healthcheck, used for both local development and Vitest integration tests. — **Reversibility:** reversible — Container orchestration and ports can be reconfigured in docker-compose.
- **D-07:** Implement programmatic idempotent schema initialization (`initWorkspaceGraph(workspaceId)`) in `packages/graph` that verifies and applies constraints and 512-d vector indexes automatically on first workspace connection, with an optional CLI migration command (`pnpm db:schema:apply`). — **Reversibility:** reversible — Schema script is self-contained openCypher.
- **D-08:** Implement custom `ArgonGraphClient` wrapper enforcing a 5000ms query timeout, typed `FalkorUnavailableError` (powering the PRD §7.4 "no graph, no answer" refusal contract), and strict `RO_QUERY` dispatch for agent/read operations. — **Reversibility:** costly — The client wrapper is the boundary for all database interactions.

### Named Query Loader & Type Contracts
- **D-09:** Author the 8 named queries as standalone `.cypher` files in `packages/graph/queries/*.cypher` with a runtime/build loader to maintain clean syntax highlighting and direct CLI testability. — **Reversibility:** reversible — Query files can be bundled or embedded.
- **D-10:** Define strict Zod validation schemas with inferred TypeScript types (`z.infer`) for query input parameters and returned record shapes, guaranteeing runtime contract safety. — **Reversibility:** reversible — Zod schemas wrap query execution inputs/outputs.
- **D-11:** Return a normalized dual-payload format from named queries: `{ raw: TRecords, graph: CytoscapeElements, evidence: EvidenceSummary }` ready for Cytoscape.js rendering and Gemma 4 evidence narration without client-side mapping duplication. — **Reversibility:** costly — Downstream gateway endpoints and UI canvas rely directly on this payload structure.
- **D-12:** Verify all 8 named queries using a deterministic synthetic fixture graph (`seed-fixture.ts`) in Vitest running against a live FalkorDB instance, asserting exact traversals, PageRank algorithms, temporal validity filters, and vector search recall. — **Reversibility:** reversible — Test fixtures can be updated and expanded.

### Embedding Pipeline & Fallback Contract
- **D-13:** Primary local embedder configured with `onnx-community/embeddinggemma-2` (q8 quantization, 512-d Matryoshka truncation with L2 norm = 1.0) on Node.js CPU via Transformers.js. — **Reversibility:** costly — Vector index dimension in FalkorDB is fixed at 512 and tied to this embedding space.
- **D-14:** Store downloaded ONNX model weights in project-level `.cache/models/` (git-ignored) with a `TRANSFORMERS_CACHE` environment variable override for reproducible, isolated Docker caching. — **Reversibility:** reversible — Cache path is an environment variable configuration.
- **D-15:** Implement transparent fallback controlled by `EMBEDDING_PROVIDER=local|gemini|auto`: attempts local Transformers.js embedder first, automatically falls back to Gemini API (`text-embedding-004`) on ONNX failure or timeout while logging telemetry. — **Reversibility:** reversible — The fallback logic lives inside the unified embedder abstraction.
- **D-16:** Unit test suite enforces strict mathematical assertions: output vector dimension === 512, L2 norm `abs(sum(v_i^2) - 1.0) < 1e-4`, and semantic clustering sanity tests. — **Reversibility:** reversible.

### the agent's Discretion
- Exact directory layout within `packages/graph` (`src/client.ts`, `src/queries/`, `src/embedding/`, `src/schema/`).
- Choice between embedding queries as raw text at compile time or reading with `fs` in Node.js with fallback.
- Docker compose service naming and volume mount paths (`.falkordb-data/`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD and Specifications
- `PRD.md` §6.1-6.5 — Functional & Non-Functional Requirements (P0 requirements FR-01 to FR-40)
- `PRD.md` §7.1-7.5 — Graph design, node/edge schema, 8 candidate named queries, "graph does real work" rules, temporal modeling
- `PRD.md` §8.1-8.3 — System architecture, Vercel/Cloud Run/VM split, and briefing data flow
- `PRD.md` §9.1-9.3 — Technology decisions (FalkorDB openCypher, Transformers.js on CPU, Gemma 4)
- `DECISIONS.md` §1 — GD-01 through GD-09 architectural commitments
- `DECISIONS.md` §2.1-2.2 — Pure FalkorDB IngestJob schema & 512-d Matryoshka embedding constraints
- `ROADMAP.md` §Phase 1 — Phase 1 Goal, Plans (01-01 to 01-04), Deliverables, and Requirements Covered

### Database & Driver Reference
- FalkorDB openCypher syntax: `GRAPH.QUERY` / `GRAPH.RO_QUERY`, vector index creation (`CREATE VECTOR INDEX FOR (d:Decision) ON (d.embedding) OPTIONS {dimension: 512, similarityFunction: 'cosine'}`)
- FalkorDB Graph Algorithms: `CALL algo.PageRank()`, `CALL algo.SPpaths()`, `CALL algo.CDLP()`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Greenfield project. No existing legacy code or libraries.
- `PRD.md` contains sample Cypher queries for temporal filtering and named query signatures.
- `DECISIONS.md` contains the exact node property contract for `IngestJob`.

### Established Patterns
- All read-only agent queries MUST execute via `GRAPH.RO_QUERY`.
- Vector embeddings MUST be truncated to 512-d and normalized to unit length (`L2 norm = 1.0`).
- No separate BullMQ or Redis store — FalkorDB is the single source of truth for both knowledge and operational state.

### Integration Points
- `packages/graph` will be imported by `packages/ingest` (Phase 2), `apps/gateway` (Phase 3), and `apps/web` (Phase 4).
- Root `docker-compose.yml` provides the FalkorDB instance on `localhost:6379`.

</code_context>

<specifics>
## Specific Ideas

- Fast feedback loop: Running `pnpm test` in `packages/graph` should spin up or connect to FalkorDB, run schema validation, execute the 8 queries against the fixture graph, and verify embedding generation in seconds.
- "No graph, no answer" failure mode: When FalkorDB is stopped (`docker compose down`), `ArgonGraphClient` throws `FalkorUnavailableError` cleanly.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within Phase 1 scope.
</deferred>

---

*Phase: 1-Database Schema & Vector Foundation*
*Context gathered: 2026-10-15*
