# Phase 5: Revert Backtest & Showcase Corpus - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 05-Revert Backtest & Showcase Corpus
**Areas discussed:** Backtest Evaluation Methodology & Metrics, No-Graph Baseline Architecture, Showcase Corpora & Pre-Indexing Strategy, Deliverables & Submission Artifacts

---

## Backtest Evaluation Methodology & Metrics

| Option | Description | Selected |
|--------|-------------|----------|
| Governing Decision Presence | A hit requires that an active governing :Decision node (covering the touched files/components prior to revert date) appears in top-k results | ✓ |
| Blast Radius & Owner Overlap | A hit requires ranking the historical author/expert :Person and coupled :File nodes that were affected by the revert | |
| Composite Retrieval Score | A weighted hit score across governing decisions (60%), coupled blast radius files (20%), and past precedent PRs (20%) | |

**User's choice:** Governing Decision Presence
**Notes:** Evaluating whether the active governing architectural decision was retrieved prior to the revert directly proves Argon's core value proposition.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Recall@1, Recall@3, Recall@5, and MRR | Provides both headline coverage and precision ranking distribution for README/blog report | ✓ |
| Recall@5 and Recall@10 only | Focuses strictly on top-k presence without reciprocal rank weighting | |
| Recall@5 + NDCG@5 | Emphasizes ranking quality when multiple decisions apply | |

**User's choice:** Recall@1, Recall@3, Recall@5, and MRR (Mean Reciprocal Rank)
**Notes:** Combines top-1 precision, top-k recall, and continuous reciprocal rank.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cypher Predicate Rewinding | Pass the revert commit timestamp as $asOf to named queries (constraining_decisions already filters valid_from <= $asOf and valid_to > $asOf) without mutating or rebuilding the graph | ✓ |
| Ephemeral Graph Materialization | Spin up an isolated temp graph in FalkorDB for each test point containing only pre-revert nodes | |
| Git History Rewind & Re-Ingest | Check out the repo at commit date and re-run ingest pipeline for each test case | |

**User's choice:** Cypher Predicate Rewinding
**Notes:** Named queries already contain the `$asOf: Integer` temporal parameter, allowing query-time zero-cost time travel.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Curated Golden Fixture Set (20-30 real cases + synthetic edge cases) | Frozen JSON fixture specifying revert commit hashes, scope files, commit dates as $asOf, and verified ground-truth decision IDs for deterministic CI/benchmark runs | ✓ |
| Dynamic In-Graph Mining | Scan all (:PullRequest)-[:REVERTS]->(:PullRequest) edges in the active workspace on every run and auto-generate test points | |
| Pure Synthetic Suite | 15-20 deterministic scenarios with synthetic decisions and known violations only | |

**User's choice:** Curated Golden Fixture Set (20-30 real cases + synthetic edge cases)
**Notes:** Guarantees reproducibility across environments and CI test runs.

---

## No-Graph Baseline Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Dual Baseline (Isolated Vector RAG + Raw LLM) | Benchmark against both (1) flat vector search over raw ADR text without graph topology/validity windows, and (2) direct Gemma 4 prompting with commit diff alone | ✓ |
| Flat Vector RAG Only | Standard similarity search over embedded ADRs/RFCs | |
| BM25 Keyword Search | Traditional text search over the repository's docs/ directory | |

**User's choice:** Dual Baseline (Isolated Vector RAG + Raw LLM)
**Notes:** Contrasting with both naive vector retrieval and raw ungrounded LLM inference provides complete empirical proof that the knowledge graph is essential.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Naive Vector Search (True Industry Baseline) | Return top-k cosine similarity purely on text embeddings without knowledge of supersession ([:SUPERSEDES]) or component boundaries — proves why naive vector RAG hallucinates superseded decisions | ✓ |
| Metadata-Filtered Vector Search | Flat vector search with basic timestamp filtering on raw docs, but still lacking multi-hop blast radius and component coupling topology | |
| Heuristic Recency Ranking | Vector search with an exponential recency decay penalty | |

**User's choice:** Naive Vector Search (True Industry Baseline)
**Notes:** Clearly demonstrates how standard vector stores fail by recommending superseded or irrelevant architectural policies.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Context-Constrained Selection | Prompt Gemma 4 with the commit diff/files and the full catalog of decision titles/summaries (unstructured context dump); evaluate whether it identifies the right governing decision without graph traversal | ✓ |
| Unconstrained Freeform Diff Review | Ask Gemma 4 blindly what architectural rules apply to the diff | |
| Toolless Multi-Turn Query | Allow Gemma 4 to ask for files or greps in a loop without graph access | |

**User's choice:** Context-Constrained Selection
**Notes:** Tests raw LLM comprehension when given all decisions without graph-derived component or temporal relationships.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated packages/eval with CLI & Fixture Cache | Modular package with CLI commands (`pnpm test:eval`, `bench:graph`, `bench:baseline`, `bench:compare`) and cached LLM responses for deterministic zero-cost CI replay | ✓ |
| Vitest Integration Suite inside packages/agent/test | Run backtest directly as integration test specs inside the existing agent package | |
| Stand-alone Bash/Node CLI scripts in scripts/eval/ | Loose benchmark scripts in the root scripts directory | |

**User's choice:** Dedicated packages/eval with CLI & Fixture Cache
**Notes:** Clean monorepo package separation with caching for fast zero-token CI testing.

---

## Showcase Corpora & Pre-Indexing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Curated Triad (Synthetic Demo + Ember RFCs + Argon Dogfood) | (1) Instant Synthetic Microservices Graph (instant offline zero-latency demo), (2) Real-world Open Source Corpus (emberjs/rfcs with 100+ real ADRs), and (3) Argon's own repository dogfooding its own decisions | ✓ |
| Astro + Ember + Synthetic | Pre-index the three exact workspaces configured in the apps/web workspace switcher | |
| Pure Synthetic Demo | Rely entirely on a synthetic graph | |

**User's choice:** Curated Triad (Synthetic Demo + Ember RFCs + Argon Dogfood)
**Notes:** Covers offline synthetic guarantee, real production open-source scale, and project self-reflection/dogfooding.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-computed Cypher / JSON Seeders with CLI Command | Frozen seed data with pre-calculated 512-d embeddings executable via `pnpm seed:showcase` (loads in seconds without model downloads or git network dependency) | ✓ |
| Docker Volume / Redis RDB Snapshot | Pre-baked FalkorDB data directory bundled directly in docker-compose | |
| Live Automated Ingestion on First Boot | Run live git clone and mining on server startup | |

**User's choice:** Pre-computed Cypher / JSON Seeders with CLI Command
**Notes:** Instant zero-network seeding that is robust to offline environments or network rate limits.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded Historical Window (Top 300-500 commits + 100% of ADRs/RFCs) | Fast seed size (<10MB), preserves full decision supersession chains, co-change coupling, and historical reverts without ballooning memory | ✓ |
| Full Git History | Ingest all historical commits and tags since repo inception | |
| ADR-Centric Ingestion | Ingest all markdown ADRs and only the commits that touched ADR files | |

**User's choice:** Bounded Historical Window (Top 300-500 commits + 100% of ADRs/RFCs)
**Notes:** High topological density without memory bloat.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Archetypal Microservice Storyline (powers S1-S3 scenario cards) | Billing, Auth, Sync services with clear decision supersession (Linear -> Exponential Jitter) and Revert #42 (Retry Storm) directly matching apps/web demo scenarios | ✓ |
| High-Density Stress Graph | Demonstrates FalkorDB performance under heavy traversal loads | |
| Security & Compliance Archetype | Focuses on Auth/RBAC deprecations | |

**User's choice:** Archetypal Microservice Storyline (powers S1-S3 scenario cards)
**Notes:** Guarantees 1:1 parity with the Showcase Hub scenario cards in the Next.js frontend.

---

## Deliverables & Submission Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-Target Formatter (CLI + JSON + README Markdown Table) | Outputs colored CLI summary, machine-readable JSON (eval-report.json), and ready-to-paste markdown tables directly embedding in README.md & submission blog post | ✓ |
| Static HTML / Chart Dashboard | Standalone static HTML page generated with embedded SVG charts | |
| In-App Web Dashboard Tab | Add an /eval or /benchmark route directly into apps/web | |

**User's choice:** Multi-Target Formatter (CLI + JSON + README Markdown Table)
**Notes:** Seamlessly feeds the benchmark table into the repository README and submission documents.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Complete Hackathon Submission Suite | System architecture diagram, openCypher graph schema diagram, 'Graph Does Real Work' table (§7.4), evaluation benchmark results, and judge quick-start demo script | ✓ |
| Minimal Developer README | Setup prerequisites, environment variables, docker-compose start instructions | |
| Comprehensive docs/ wiki | Multi-page documentation directory covering each package individually | |

**User's choice:** Complete Hackathon Submission Suite
**Notes:** Fulfills every compliance requirement in the hackathon judging rubric.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Automated Demo Smoke Test Script (`pnpm demo:check`) | End-to-end script that validates FalkorDB connectivity, seeds test graphs, runs a sample briefing pipeline call, verifies citation integrity, and checks kill-switch refusal | ✓ |
| Manual Verification Steps | Provide a step-by-step verification checklist in README.md | |
| Docker Compose Healthcheck Suite | Embed healthchecks and automatic test containers in docker-compose.yml | |

**User's choice:** Automated Demo Smoke Test Script (`pnpm demo:check`)
**Notes:** Bulletproof validation for judges and organizers running the repository locally.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Publication-Ready Markdown Post (`docs/BLOG-POST.md`) | Dedicated technical blog post draft detailing the architecture, 'No Graph, No Answer' principle, and backtest results ready to publish for the side prize | ✓ |
| Embedded README Narrative | Incorporate the technical narrative directly into the root README.md | |
| Short 300-word Submission Summary | A concise submission pitch text in SUBMISSION.md | |

**User's choice:** Publication-Ready Markdown Post (`docs/BLOG-POST.md`)
**Notes:** Meets the side prize criteria (AirPods 5) for technical writeup detailing benchmark findings.

---

## the agent's Discretion

- Internal class/file structure within `packages/eval/src/` (`runner/`, `baselines/`, `metrics/`, `reporters/`).
- Specific threshold formatting and color schemes for CLI terminal benchmark tables.
- Exact styling and diagram formatting (Mermaid vs ASCII art) in `README.md`.

## Deferred Ideas

- None — all decisions stayed strictly within Phase 5 scope.

