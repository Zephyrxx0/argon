# Phase 2: Ingestion Pipeline & Decision Mining - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the background ingestion worker service (`packages/ingest`) that clones target repositories using blobless clones, extracts commits and mailmap-aware author mappings, computes co-change coupling to establish component boundaries and `(:Component)-[:DEPENDS_ON]->(:Component)` relationships, identifies git revert commits into `(:PullRequest)-[:REVERTS]->(:PullRequest)` edges, mines architectural decisions from markdown ADRs/RFCs and commit messages into `(:Decision)` nodes with temporal validity (`valid_from` / `valid_to` epoch seconds) and `[:SUPERSEDES]` relationships, vectorizes decisions using the 512-d Matryoshka embedder (`ArgonEmbedder`), and writes all operational states to `(:IngestJob)` nodes in FalkorDB using high-throughput parameterized Cypher UNWIND batches.

In scope:
- Repository cloning with `simple-git` using blobless filter (`--filter=blob:none`) and configurable commit window (default 1,000 commits or 12 months)
- Ephemeral clone directory management (`os.tmpdir()/argon-clones/<workspaceId>`) with automated cleanup
- Commit and author extraction with `.mailmap` support and privacy-preserving SHA-256 email hashing for `Person.id`
- Hybrid component modeling: directory-based component hierarchy with co-change refinement
- Filtered Jaccard co-change coupling calculation (min 3 co-commits, Jaccard >= 0.15, filtering commits touching > 30 files) to produce `(:Component)-[:DEPENDS_ON {weight, count}]->(:Component)` edges
- Strict architectural file filtering (ignoring lockfiles, minified files, vendor directories, and binary assets)
- Markdown ADR/RFC discovery and parsing across standard directory trees (`docs/adr/`, `rfcs/`, `decisions/`, `docs/arch*/`)
- Tier 0 regex commit pre-filtering for architectural keywords and automated git revert extraction into `[:REVERTS]` edges
- Temporal validity window management: `valid_from` and `valid_to` timestamps in epoch seconds, closing predecessor windows on `[:SUPERSEDES]`
- Batch embedding of decision titles and summaries using `ArgonEmbedder` from `packages/graph` in batches of 8-16
- Dual interface: programmatic pipeline API (`runIngestion()`) and standalone CLI runner (`argon-ingest`)
- Fine-grained `(:IngestJob)` lifecycle tracking (`queued` -> `cloning` -> `mining` -> `indexing` -> `completed` / `failed`)
- Parameterized `UNWIND $batch AS item` batch writes (500 items per batch) to FalkorDB
- Vitest end-to-end integration test with a deterministic programmatic git fixture repo tested against the local FalkorDB Docker container

Out of scope:
- Forge API integrations (GitHub PR/MR comments and issue fetchers) (Tier 1)
- Gateway HTTP service and agent briefing narration (Phase 3)
- Web frontend command bar and Cytoscape UI canvas (Phase 4)
- Revert backtest benchmark harness (Phase 5)
</domain>

<decisions>
## Implementation Decisions

### Git Clone & History Depth
- **D-01:** Use `simple-git` with `--filter=blob:none` (blobless clone) for repository cloning and commit log streaming. — **Reversibility:** costly — Git extraction wrappers and log parsing across `packages/ingest` depend on simple-git abstractions.
- **D-02:** Default commit history depth set to 1,000 commits (or 12-month cutoff) with configurable CLI override flag (`--max-commits`, `--since`). — **Reversibility:** reversible — Configuration parameter controlling commit extraction loop limit.
- **D-03:** Store clones in an ephemeral temp directory (`os.tmpdir()/argon-clones/<workspaceId>`) with automated cleanup in `finally` blocks, with optional `KEEP_CLONE=true` debug flag. — **Reversibility:** reversible — File path and cleanup logic are isolated in the clone utility.
- **D-04:** Author mapping parses `.mailmap` if present to de-duplicate aliases/emails, then hashes the canonical email via SHA-256 for `Person.id` and stores the public display name as `Person.name` (raw emails never stored). — **Reversibility:** costly — Person node identity format and deduplication logic are referenced in graph queries (`who_knows`).

### Co-Change Coupling & Component Boundaries
- **D-05:** Implement a hybrid component modeling strategy: top-level / package-level directory paths define baseline named `(:Component)` nodes (e.g. `packages/graph`, `apps/web`), while file co-change creates `(:Component)-[:DEPENDS_ON]->(:Component)` edges and groups root/orphan files. — **Reversibility:** costly — Component derivation logic establishes the foundational architectural graph structure.
- **D-06:** Filtered Jaccard similarity for co-change coupling: require minimum 3 co-commits, Jaccard similarity >= 0.15, and ignore mass commits touching > 30 files to exclude formatters, license updates, and lockfile churn. — **Reversibility:** reversible — Thresholds and filters can be tuned without changing graph schema.
- **D-07:** Strict architectural file filter: Exclude lockfiles (`*-lock.*`, `*.lock`), minified assets (`*.min.js`), documentation binaries/images, and vendored code from coupling calculations to prevent artificial dependency hubs. — **Reversibility:** reversible — Filter patterns are defined in an ignore list.
- **D-08:** PageRank and centrality algorithms run on-the-fly dynamically via named openCypher queries (matching Phase 1's `03_risk_ranking.cypher` and `08_component_overview.cypher`) — ingestion remains write-only and idempotent. — **Reversibility:** reversible — Database query design pattern.

### Decision Mining & Temporal Windows
- **D-09:** Glob scanner and deterministic AST/regex parser for markdown ADRs and RFCs scanning standard paths (`**/adr/**/*.md`, `**/rfcs/**/*.md`, `**/decisions/**/*.md`, `**/docs/arch*/**/*.md`), extracting title, status (accepted/superseded), date, and references via markdown frontmatter and `# Title` / `## Status` headers. — **Reversibility:** reversible — Markdown extraction logic can be extended with additional path patterns.
- **D-10:** Tier 0 regex pre-filter and revert miner: match high-signal commit keywords (`revert`, `supersedes`, `deprecate`, `breaking change`, `ADR-`, `RFC-`); map `Revert "..."` commits directly to `(:PullRequest)-[:REVERTS]->(:PullRequest)` edges and extract decisions deterministically. — **Reversibility:** reversible — Regex patterns and commit classification rules are modular.
- **D-11:** Temporal window alignment using epoch seconds: Set `valid_from` to commit/file timestamp. When decision B supersedes decision A, set `A.valid_to = B.valid_from`, update `A.status = 'superseded'`, and create `(B)-[:SUPERSEDES]->(A)`. Active decisions retain `valid_to = null` and `status = 'accepted'`. — **Reversibility:** costly — Aligns directly with Phase 1's temporal query contract in `05_constraining_decisions.cypher`.
- **D-12:** Batch decision embeddings using `ArgonEmbedder` from `packages/graph`: batch-vectorize decision texts in chunks of 8-16 items before database insertion, enforcing 512-d Matryoshka truncation and L2 re-normalization. — **Reversibility:** costly — Tied to FalkorDB 512-d vector index.

### Worker Ingestion Lifecycle & Batch Ingestion
- **D-13:** Dual architecture: export core programmatic pipeline `runIngestion(config)` from `packages/ingest` for test harnesses and gateway use, plus a standalone CLI runner `argon-ingest --repo <url> [--workspace <id>]` for headless worker execution. — **Reversibility:** reversible — Standard TypeScript package exports.
- **D-14:** Fine-grained `(:IngestJob)` lifecycle tracking: update job node in FalkorDB at milestones (`queued` [0.0] -> `cloning` [0.15] -> `mining` [0.45] -> `indexing` [0.80] -> `completed` [1.0]), capturing error strings if any stage fails. — **Reversibility:** reversible — Status schema defined in DECISIONS.md §2.1.
- **D-15:** Batch Cypher mutations using parameterized `UNWIND $batch AS item` queries in chunks of 500 items per transaction to maximize write throughput and avoid network roundtrips over Redis protocol. — **Reversibility:** costly — Ingestion writer architecture relies on UNWIND query templates.
- **D-16:** Vitest test suite uses a deterministic programmatic git fixture repository created via `simple-git` in a temp directory with real commits, reverts, ADR markdown files, and co-change patterns, tested against the local FalkorDB Docker container. — **Reversibility:** reversible — Test fixture pattern.

### the agent's Discretion
- Exact file layout in `packages/ingest` (`src/git/`, `src/mining/`, `src/coupling/`, `src/writer/`, `src/pipeline.ts`).
- Tuning specific batch sizes (between 250 and 1000) based on FalkorDB memory behavior.
- Internal error wrapping and progress logging format.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD and Architecture
- `PRD.md` §6.2 — Ingestion (repo to graph, Tier 0/1/2, FR-09 to FR-19)
- `PRD.md` §7.1-7.2 — Node and edge definitions (`IngestJob`, `File`, `Person`, `PullRequest`, `Component`, `Decision`, `TOUCHES`, `IN_COMPONENT`, `DEPENDS_ON`, `GOVERNS`, `SUPERSEDES`, `REVERTS`) and property hashing
- `PRD.md` §7.3 — Named query contracts (`01_resolve_scope`, `02_blast_radius`, `03_risk_ranking`, `04_who_knows`, `05_constraining_decisions`, `08_component_overview`)
- `PRD.md` §7.5 — Temporal modeling rules (`valid_from`, `valid_to`, `asOf` parameter)
- `DECISIONS.md` §1 GD-01 — Tier 0 (Git co-change + commits) & Curated Markdown ADRs/RFCs first
- `DECISIONS.md` §1 GD-03 — EmbeddingGemma-2 (`q8`, 512-d) via Transformers.js in Node.js CPU in worker
- `DECISIONS.md` §1 GD-09 — Ingestion Job Orchestration: Pure FalkorDB `IngestJob` node lifecycle
- `DECISIONS.md` §2.1 — IngestJob node schema (`id`, `repo_url`, `status`, `progress`, `error`, `started_at`, `updated_at`)
- `ROADMAP.md` §Phase 2 — Goal and plan breakdown (`02-01` to `02-04`)
- `.planning/phases/01-database-schema-vector-foundation/01-CONTEXT.md` — Phase 1 schema, client, and embedding foundation

### Codebase Interfaces
- `packages/graph/src/client.ts` — `ArgonGraphClient`, query execution, timeout and error handling
- `packages/graph/src/schema/init.ts` — `initWorkspaceGraph(workspaceId)` idempotent schema initializer
- `packages/graph/src/embedding/embedder.ts` — `ArgonEmbedder`, `formatInput`, `processMatryoshkaVector`
- `packages/graph/queries/*.cypher` — Named query contracts that the ingested graph must satisfy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ArgonGraphClient` in `packages/graph`: Provides connection management, graph selection (`db.selectGraph(workspaceId)`), and parameterized write execution.
- `initWorkspaceGraph` in `packages/graph`: Ensures constraints and vector indexes are applied to the target workspace before ingestion writes start.
- `ArgonEmbedder` in `packages/graph`: Generates 512-d normalized embeddings with automatic local ONNX CPU execution and Gemini fallback.
- `packages/tsconfig`: Shared TypeScript configurations (`base.json`, `node.json`).

### Established Patterns
- All database operations are parameterized Cypher queries executed against FalkorDB.
- Vectors in FalkorDB must be float arrays of dimension 512, normalized to unit length (`L2 norm = 1.0`).
- No secondary databases or queues: `IngestJob` node in FalkorDB is the single source of truth for job state.
- Hashed Person IDs: `Person.id` is `sha256(canonical_email)`, never storing raw emails.

### Integration Points
- `packages/ingest` consumes `packages/graph` (`ArgonGraphClient`, `initWorkspaceGraph`, `ArgonEmbedder`).
- In Phase 3, `apps/gateway` will trigger or poll `packages/ingest` jobs.
- In Phase 5, `packages/eval` will use `packages/ingest` to pre-index showcase repositories and historical revert points.

</code_context>

<specifics>
## Specific Ideas

- Programmatic Git Test Fixture: Creating a test helper in `packages/ingest/test/fixture-repo.ts` that initializes an ephemeral git repository with mock commits, a `Revert "..."` commit, and sample ADR markdown files will allow 100% deterministic local CI testing without external network dependencies.
- Zero Redis Queue Dependencies: Storing job records directly on `(:IngestJob)` allows the web UI in Phase 4 to query progress using simple Cypher `MATCH (j:IngestJob {id: $jobId}) RETURN j`.

</specifics>

<deferred>
## Deferred Ideas

- None — all decisions stayed strictly within Phase 2 scope.
</deferred>

---

*Phase: 2-Ingestion Pipeline & Decision Mining*
*Context gathered: 2026-10-15*

