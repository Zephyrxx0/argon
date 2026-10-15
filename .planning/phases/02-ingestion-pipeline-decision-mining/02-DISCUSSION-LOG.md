# Phase 2: Ingestion Pipeline & Decision Mining - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 2-Ingestion Pipeline & Decision Mining
**Areas discussed:** Git Clone & History Depth, Co-Change Coupling & Component Boundaries, Decision Mining & Temporal Windows, Worker Ingestion Lifecycle & Batch Ingestion

---

## Git Clone & History Depth

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) simple-git with blobless clone | Use the robust `simple-git` npm package with `--filter=blob:none`, streaming stdout to prevent memory spikes on large repos. | ✓ |
| node:child_process spawn wrapper | Hand-rolled git subprocess execution with custom stdout parsers and zero extra runtime dependencies. | |
| You decide | Pick whichever gives better streaming control and error handling. | |

**User's choice:** (Recommended) simple-git with blobless clone  
**Notes:** Chosen for streaming efficiency and mature error recovery.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Default 1,000 commits (or 12-month cutoff) with configurable CLI override | Captures rich co-change coupling and ADR history while keeping ingest times under ~30-60s for hackathon repos. | ✓ |
| Full commit history (unbounded) | Walk all commits on default branch for complete historical fidelity, with a safety timeout (e.g. 5 minutes). | |
| Shallow window (last 250-300 commits) | Optimized for ultra-fast demo ingestion (<15s) at the expense of older historical context. | |

**User's choice:** (Recommended) Default 1,000 commits (or 12-month cutoff) with configurable CLI override  
**Notes:** Balances rich co-change coupling analysis against fast demo ingestion.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Ephemeral temp directory with automatic cleanup | Automatic cleanup on job success/failure (plus an optional `KEEP_CLONE=true` debug flag): Keeps the host stateless and disk usage minimal. | ✓ |
| Persistent workspace cache directory | Retains clones to allow fast incremental `git fetch` on re-ingest. | |
| You decide | Choose the cleaner, lower-maintenance pattern for the worker VM/container. | |

**User's choice:** (Recommended) Ephemeral temp directory with automatic cleanup  
**Notes:** Ensures workers remain stateless without disk exhaustion.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Mailmap-aware with SHA-256 hashed email | Parse `.mailmap` if present to de-duplicate aliases/emails, then hash the canonical email via SHA-256 (`Person.id`) with public display name (`Person.name`). | ✓ |
| Strict SHA-256 hashed email only | Disregard `.mailmap`; hash `author_email.toLowerCase().trim()` directly for `Person.id`. | |
| You decide | Implement whichever ensures cleaner author consolidation without privacy leaks. | |

**User's choice:** (Recommended) Mailmap-aware with SHA-256 hashed email  
**Notes:** De-duplicates contributors accurately while upholding strict privacy requirements.

---

## Co-Change Coupling & Component Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Hybrid directory hierarchy + co-change | Top-level / package-level directory paths define named Component nodes (e.g. `packages/graph`, `apps/web`), while file co-change creates `(:Component)-[:DEPENDS_ON]->(:Component)` edges and groups root/orphan files. | ✓ |
| Pure graph community detection (CDLP / Louvain) | Run community detection strictly on file-level co-change edges without directory assumptions, deriving synthetic clusters. | |
| You decide | Pick whichever produces the most readable and query-effective component boundaries for briefings. | |

**User's choice:** (Recommended) Hybrid directory hierarchy + co-change  
**Notes:** Preserves intuitive project structure while letting co-change establish dynamic dependency linkages.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Filtered Jaccard similarity | Require min 3 co-commits, Jaccard >= 0.15, ignoring commits touching > 30 files: Excludes mass formatters/license sweeps and records weighted `[:DEPENDS_ON {weight: jaccard, count: co_commits}]` edges. | ✓ |
| Raw co-commit count threshold | Simple count cutoff regardless of component size or mass-commit contamination. | |
| You decide | Implement the standard software engineering co-change heuristic from the research literature. | |

**User's choice:** (Recommended) Filtered Jaccard similarity  
**Notes:** Prevents giant chore commits from polluting architectural boundaries.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Strict architectural filter | Exclude lockfiles (`*-lock.*`, `*.lock`), minified assets (`*.min.js`), docs binaries/images, and vendored code from coupling calculations to prevent synthetic dependency hubs. | ✓ |
| All committed files | Track every single file checked into git without exception. | |
| You decide | Filter based on standard code extensions (`.ts`, `.js`, `.py`, `.go`, `.rs`, `.md`, etc.) and skip known churn files. | |

**User's choice:** (Recommended) Strict architectural filter  
**Notes:** Eliminates lockfile churn and binary noise.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) On-the-fly via named Cypher queries | Let FalkorDB run `algo.PageRank` dynamically during query execution (matching Phase 1's `03_risk_ranking.cypher` implementation) — keeps ingest write-only and idempotent. | ✓ |
| Post-ingest precomputation | Run `algo.PageRank` at the end of ingestion and write `pagerank_score` directly onto `(:Component)` node properties. | |
| You decide | Pick whichever matches the existing Phase 1 query contracts best. | |

**User's choice:** (Recommended) On-the-fly via named Cypher queries  
**Notes:** Ingest stays fast and write-only; calculations remain dynamic inside openCypher queries.

---

## Decision Mining & Temporal Windows

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Glob scanner with AST/regex markdown parser | Scan standard directories (`**/adr/**/*.md`, `**/rfcs/**/*.md`, `**/decisions/**/*.md`, `**/docs/arch*/*.md`) extracting title, status (accepted/superseded), date, and references via markdown frontmatter and `# Title` / `## Status` headers. | ✓ |
| Single-call LLM extraction over candidate markdown files | Pass markdown file contents to Gemma 4 via AI Studio free tier to extract decisions. | |
| You decide | Implement deterministic markdown parser first with LLM fallback only if headers cannot be parsed. | |

**User's choice:** (Recommended) Glob scanner with AST/regex markdown parser  
**Notes:** Deterministic, zero-token extraction from structured ADR/RFC markdown files.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Tier 0 regex pre-filter + Revert miner | Match high-signal commit keywords (`revert`, `supersedes`, `deprecate`, `breaking change`, `ADR-`, `RFC-`); map `Revert "..."` directly to `(:PullRequest)-[:REVERTS]->(:PullRequest)` edges and extract decisions deterministically. | ✓ |
| Regex pre-filter + batched Gemma 4 structured extraction | Filter candidate commits with regex, then send top 20 candidate messages to Gemma 4 for title/summary extraction. | |
| Strict regex only | Extract only commits explicitly labeled with conventional prefixes or revert signatures. | |

**User's choice:** (Recommended) Tier 0 regex pre-filter + Revert miner  
**Notes:** Adheres to GD-01, extracting high-signal architectural commits and revert pairs reliably.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Explicit timestamp alignment (epoch seconds) | Set `valid_from` to commit/file timestamp; on supersession (B supersedes A), set A.valid_to = B.valid_from, A.status = 'superseded', and create `(B)-[:SUPERSEDES]->(A)`. Active decisions keep `valid_to = null`. | ✓ |
| Epoch milliseconds alignment | Same logic as above, but storing raw millisecond timestamps `Date.now()`. | |
| You decide | Ensure exact parity with Phase 1 `05_constraining_decisions.cypher` parameter format. | |

**User's choice:** (Recommended) Explicit timestamp alignment (epoch seconds)  
**Notes:** Guarantees temporal consistency with the named query predicates.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Batched ArgonEmbedder from packages/graph | Directly reuse the verified `ArgonEmbedder` (Transformers.js / Gemini fallback) to batch-embed all mined decision texts in parallel batches of 8-16 before database insertion. | ✓ |
| Sequential single-item embedding | Embed each decision one-by-one as it is mined. | |
| You decide | Batching sized to prevent Node CPU thread starvation. | |

**User's choice:** (Recommended) Batched ArgonEmbedder from packages/graph  
**Notes:** Reuses Phase 1 512-d Matryoshka embedder without code duplication.

---

## Worker Ingestion Lifecycle & Batch Ingestion

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Dual interface (Programmatic pipeline + CLI runner) | Export `runIngestion(config)` from `packages/ingest` for tests and gateway integration, plus a CLI entrypoint `argon-ingest --repo <url> [--workspace <id>]` for headless worker execution. | ✓ |
| HTTP worker microservice | Worker runs a standalone HTTP listener (e.g. Fastify/Hono) on port 8081 accepting `POST /jobs` triggers. | |
| Standalone CLI binary only | Executed solely via shell command / cron. | |

**User's choice:** (Recommended) Dual interface (Programmatic pipeline + CLI runner)  
**Notes:** Maximum flexibility for both automated tests and background process execution.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Fine-grained stage transitions | Update `(:IngestJob)` at each milestone (`queued` [0.0] -> `cloning` [0.15] -> `mining` [0.45] -> `indexing` [0.80] -> `completed` [1.0]), capturing error strings if any step throws. | ✓ |
| Coarse transitions only | Update only on start (`queued`), running (`running` [0.5]), and final state (`completed` or `failed`). | |
| You decide | Pick whichever gives best fidelity for the Next.js UI progress bar. | |

**User's choice:** (Recommended) Fine-grained stage transitions  
**Notes:** Drives the UI progress bar smoothly across ingestion phases.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Parameterized UNWIND batches (500 items per batch) | Chunk nodes and edges into batches and execute via `UNWIND $batch AS item MERGE ...` for high-throughput, low-latency ingestion. | ✓ |
| Sequential per-node/edge queries | Execute individual Cypher statements for each entity. | |
| You decide | Batch size optimized for Redis socket buffer limits. | |

**User's choice:** (Recommended) Parameterized UNWIND batches (500 items per batch)  
**Notes:** Drastically cuts network round-trips to FalkorDB.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Programmatic git test fixture + FalkorDB test container | Vitest test creates an ephemeral git repo with commits, reverts, ADRs, and co-change patterns, runs `runIngestion()`, and asserts exact graph nodes/edges in FalkorDB. | ✓ |
| Live public repo clone test | Run test against a small real GitHub repository over the network. | |
| Unit mocks only | Mock git CLI and FalkorDB client without live container interaction. | |

**User's choice:** (Recommended) Programmatic git test fixture + FalkorDB test container  
**Notes:** Fast, deterministic, and verifies 100% of the ingestion pipeline end-to-end in CI/local testing.

---

## the agent's Discretion

- Internal file layout within `packages/ingest`.
- Micro-tuning of UNWIND batch sizes based on container memory.
- Detailed progress logging format.

## Deferred Ideas

- None — all topics discussed were directly within Phase 2 scope.
