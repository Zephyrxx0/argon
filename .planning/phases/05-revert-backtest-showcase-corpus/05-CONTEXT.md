# Phase 5: Revert Backtest & Showcase Corpus - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `packages/eval` containing the automated historical revert backtest runner with `asOf` date rewinding against FalkorDB, compute recall@k (Recall@1, Recall@3, Recall@5, MRR) against a dual no-graph baseline (naive flat vector search over raw ADR text and context-constrained zero-shot Gemma 4 prompting), and pre-index the showcase demonstration repositories into FalkorDB via reproducible CLI seeders (`Synthetic Microservices Demo`, `Ember.js RFC Corpus`, and `Argon Dogfood Workspace`). Finalize the submission suite in `README.md` (architecture & schema diagrams, §7.4 "Graph Does Real Work" matrix, demo script), an end-to-end demo verification smoke test (`pnpm demo:check`), and publication-ready blog post draft (`docs/BLOG-POST.md`).

In scope:
- Standalone package `packages/eval` in monorepo with CLI commands (`pnpm test:eval`, `bench:graph`, `bench:baseline`, `bench:compare`)
- Curated golden fixture set (`fixtures/reverts.json`) of 20–30 real and synthetic revert cases with commit timestamps, touched scopes, and verified governing `:Decision` ground truth
- Temporal backtest harness running `asOf` query-time rewinding on openCypher named queries (specifically `05_constraining_decisions.cypher`)
- Dual no-graph baseline: (1) Naive flat vector cosine similarity search over raw ADR text without graph topology or `[:SUPERSEDES]` temporal validity, and (2) Context-constrained zero-shot Gemma 4 prompting with commit diff and full decision catalog
- Metric computation engine reporting Recall@1, Recall@3, Recall@5, and MRR (Mean Reciprocal Rank)
- Fixture replay caching mechanism for LLM responses to ensure fast, deterministic, zero-cost CI replay
- Multi-target formatter generating colored CLI tables, machine-readable JSON (`eval-report.json`), and ready-to-paste markdown tables for `README.md` and blog post
- Curated triad showcase corpus: (1) Synthetic Microservices Graph (instant offline zero-latency demo powering S1-S3 scenario cards), (2) Real-world Open Source Corpus (`emberjs/rfcs` with 100+ real ADRs), and (3) Argon Dogfood Workspace indexing Argon's own repo and ADRs
- Pre-computed Cypher / JSON seeders with pre-calculated 512-d embeddings executable via `pnpm seed:showcase`
- Bounded historical ingestion window (top 300–500 commits + 100% of markdown ADRs/RFCs) keeping seed artifacts compact (<10MB)
- Comprehensive Hackathon Submission Suite in root `README.md` (ASCII/Mermaid system architecture, openCypher schema diagram, §7.4 "Graph Does Real Work" table, evaluation benchmark results, and judge quick-start demo script)
- Automated Demo Smoke Test Script (`pnpm demo:check`) validating DB connectivity, seed data presence, briefing pipeline call, citation integrity, and kill-switch refusal ("no graph, no answer")
- Publication-ready technical blog post draft in `docs/BLOG-POST.md` for the hackathon side prize

Out of scope:
- Custom AST/code symbol parsers (Graphify is optional input)
- Live multi-user webhook synchronization (post-hackathon v2)
- Multi-repo cross-organization indexing (scoped to single-repo workspaces)
- External Redis or BullMQ instances (FalkorDB remains the sole datastore)
</domain>

<decisions>
## Implementation Decisions

### Backtest Evaluation Methodology & Metrics
- **D-01:** Governing Decision Presence ground truth: A hit requires that an active governing `:Decision` node (covering the touched files/components prior to revert date) appears in top-k results. — **Reversibility:** costly — Dictates evaluation harness validation logic.
- **D-02:** Metric cutoffs: Report Recall@1, Recall@3, Recall@5, and MRR (Mean Reciprocal Rank) to measure both immediate precision and broader top-k coverage for README and blog reports. — **Reversibility:** reversible — Benchmark aggregation calculations.
- **D-03:** Cypher Predicate Rewinding: Pass revert commit timestamp as `$asOf` to named queries (`d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)`) without mutating or rebuilding the graph database. — **Reversibility:** costly — Query parameter interface and temporal filtering contract.
- **D-04:** Curated Golden Fixture Set: 20-30 real cases + synthetic edge cases frozen in `packages/eval/fixtures/reverts.json` with commit hashes, scope files, commit dates, and verified decision IDs for deterministic CI/benchmark runs. — **Reversibility:** reversible — Test fixture file.

### No-Graph Baseline Architecture
- **D-05:** Dual Baseline Benchmark: Test against both (1) flat vector search over raw ADR text without graph topology/validity windows, and (2) direct Gemma 4 prompting with commit diff and full decision catalog. — **Reversibility:** costly — Establishes baseline evaluation packages.
- **D-06:** Naive Vector Search (True Industry Baseline): Return top-k cosine similarity purely on text embeddings without knowledge of supersession (`[:SUPERSEDES]`) or component boundaries, demonstrating why naive vector RAG hallucinates superseded decisions. — **Reversibility:** reversible — Baseline search implementation.
- **D-07:** Context-Constrained Selection for Raw LLM: Prompt Gemma 4 with commit diff/files and the full catalog of decision titles/summaries (unstructured context dump) to evaluate whether it can pinpoint governing decisions without graph traversal. — **Reversibility:** reversible — LLM baseline prompt structure.
- **D-08:** Dedicated `packages/eval` package with CLI commands (`pnpm test:eval`, `bench:graph`, `bench:baseline`, `bench:compare`) and cached LLM responses for deterministic zero-cost CI replay. — **Reversibility:** costly — Monorepo workspace package.

### Showcase Corpora & Pre-Indexing Strategy
- **D-09:** Curated Triad Corpus: (1) Instant Synthetic Microservices Graph (instant offline zero-latency demo), (2) Real-world Open Source Corpus (`emberjs/rfcs` with 100+ real ADRs), and (3) Argon Dogfood Workspace indexing Argon's own repo and ADRs. — **Reversibility:** costly — Workspace dataset configuration in frontend and database.
- **D-10:** Pre-computed Cypher / JSON Seeders with CLI Command: Frozen seed data with pre-calculated 512-d embeddings executable via `pnpm seed:showcase` (loads in seconds without model downloads or git network dependency). — **Reversibility:** costly — Ingest data pipeline and seed artifact formats.
- **D-11:** Bounded Historical Window: Top 300-500 commits + 100% of markdown ADRs/RFCs for real repositories, keeping seed size compact (<10MB) while preserving rich co-change coupling, multiple reverts, and supersession chains. — **Reversibility:** reversible — Ingestion filter settings.
- **D-12:** Archetypal Microservice Storyline for Synthetic Demo: Billing, Auth, Sync services with clear decision supersession (Linear Backoff -> Exponential Jitter) and Revert #42 (Retry Storm) directly powering `apps/web` Showcase Hub scenario cards (S1-S3). — **Reversibility:** reversible — Synthetic fixture generation logic.

### Deliverables & Submission Artifacts
- **D-13:** Multi-Target Formatter: Evaluation runner outputs colored CLI summary table, machine-readable JSON (`eval-report.json`), and ready-to-paste markdown table for `README.md` & blog post. — **Reversibility:** reversible — Output reporting layer.
- **D-14:** Complete Hackathon Submission Suite: Finalize root `README.md` with system architecture diagram, openCypher graph schema diagram, 'Graph Does Real Work' table (§7.4), benchmark results table, and judge quick-start demo script. — **Reversibility:** reversible — Documentation.
- **D-15:** Automated Demo Smoke Test Script (`pnpm demo:check`): End-to-end script validating FalkorDB connectivity, seed data presence, sample briefing pipeline call, citation integrity, and kill-switch refusal ("no graph, no answer"). — **Reversibility:** reversible — Test runner script.
- **D-16:** Publication-Ready Blog Post Draft (`docs/BLOG-POST.md`): Dedicated technical post detailing architecture, temporal reasoning, backtest results, and key learnings ready for side-prize submission. — **Reversibility:** reversible — Submission article.

### the agent's Discretion
- Internal class/file structure within `packages/eval/src/` (`runner/`, `baselines/`, `metrics/`, `reporters/`).
- Specific threshold formatting and color schemes for CLI terminal benchmark tables.
- Exact styling and diagram formatting (Mermaid vs ASCII art) in `README.md`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD and Requirements
- `PRD.md` §3.3 — Success criteria (kill-switch test, citation integrity, backtest recall, embedding bake-off)
- `PRD.md` §7.4 — The "graph does real work" test (rule 1: queries impossible in relational/vector alone; rule 3: canvas renders results; rule 4: kill-switch)
- `PRD.md` §10.3 — Self-hosted FalkorDB setup and parameters
- `PRD.md` §12 — Evaluation plan (revert backtest, no-graph baseline, embedding bake-off, CI tests)
- `PRD.md` §13 — Hackathon compliance checklist (tracks, README criteria, demo video, rules)
- `PRD.md` §17 — Demo script (2-minute judge walkthrough for scenarios S1-S3)
- `.planning/REQUIREMENTS.md` — EVAL-01 requirement specification

### Codebase Interfaces & Named Queries
- `packages/graph/queries/05_constraining_decisions.cypher` — Temporal `$asOf` predicate and `[:GOVERNS]`/`[:SUPERSEDES]` traversal
- `packages/graph/queries/06_precedent_search.cypher` — Revert and precedent vector search
- `packages/graph/src/embedding/embedder.ts` — EmbeddingGemma-2 512-d CPU embedding generator
- `packages/graph/src/queries/index.ts` — Parameterized named queries executor
- `packages/ingest/src/pipeline.ts` — Ingestion pipeline and graph population
- `packages/ingest/src/mining/reverts.ts` — Git revert commit identification
- `packages/ingest/src/mining/decisions.ts` — Decision extraction and supersession mining
- `packages/agent/src/briefing/pipeline.ts` — Briefing pipeline with citation post-check
- `apps/web/components/workspace/workspace-switcher.tsx` — Preloaded showcase repository names and switcher UI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/graph/queries/05_constraining_decisions.cypher`: Already implements `$asOf: Integer` temporal filtering (`d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)`), enabling instant time-rewound decision retrieval.
- `packages/graph/src/embedding/embedder.ts`: Provides local `generateEmbedding()` for computing 512-d embeddings using EmbeddingGemma-2 on Node.js CPU.
- `packages/ingest/src/pipeline.ts`: End-to-end repository ingestion pipeline extracting commits, files, co-change coupling, decisions, and reverts.
- `packages/agent/src/client/direct.ts`: `DirectGraphGatewayClient` allowing direct FalkorDB execution in evaluation scripts without requiring an external HTTP server.
- `apps/web/components/workspace/workspace-switcher.tsx`: References pre-indexed showcase workspaces (`Ember ADR Corpus`, `Astro RFC Corpus`, `Synthetic Demo`).

### Established Patterns
- Monorepo package imports via `@argon/*` (`@argon/graph`, `@argon/agent`, `@argon/ingest`).
- Fail-closed citation integrity: claims must cite verified node IDs; 0 citations triggers `CITATION_INTEGRITY_FAILURE`.
- All database computations happen in FalkorDB; client code only handles layout and interaction.
- Strict Zod validation and structured outputs for LLM results.

### Integration Points
- `packages/eval/src/cli.ts`: Entry point for evaluation CLI commands (`bench:graph`, `bench:baseline`, `bench:compare`).
- `packages/eval/fixtures/reverts.json`: Frozen golden test dataset of revert commits and ground-truth decisions.
- `packages/ingest/src/seed.ts` (or `packages/graph/src/seed.ts`): Standalone seed script loading pre-computed showcase datasets into FalkorDB.
- `scripts/demo-check.ts` (or `pnpm demo:check`): Automated smoke test script validating live demo readiness.
- `README.md` & `docs/BLOG-POST.md`: Core hackathon submission artifacts presenting benchmarks and architecture.

</code_context>

<specifics>
## Specific Ideas

- Visual Markdown Benchmark Table:
  ```
  | Metric | Naive Vector RAG | Raw LLM (Gemma 4) | Argon (FalkorDB Graph) | Delta vs Baseline |
  |---|---|---|---|---|
  | Recall@1 | 23.3% | 16.7% | **83.3%** | +60.0% |
  | Recall@3 | 43.3% | 33.3% | **93.3%** | +50.0% |
  | Recall@5 | 56.7% | 40.0% | **96.7%** | +40.0% |
  | MRR | 0.354 | 0.245 | **0.887** | +0.533 |
  | Superseded Hallucinations | 36.7% | 46.7% | **0.0%** | -36.7% |
  ```
- Instant Seed Speed: Because pre-computed seeders bundle 512-d vector embeddings, `pnpm seed:showcase` finishes in under 5 seconds without needing HuggingFace downloads or git network calls during live evaluation.
- Kill-Switch Proof in `pnpm demo:check`: Automatically verifies that stopping FalkorDB or querying an unreachable instance produces the strict "no graph, no answer" refusal with 0 hallucinated claims.

</specifics>

<deferred>
## Deferred Ideas

- None — all decisions stayed strictly within Phase 5 scope.

</deferred>

---

*Phase: 05-Revert Backtest & Showcase Corpus*
*Context gathered: 2026-10-16*
