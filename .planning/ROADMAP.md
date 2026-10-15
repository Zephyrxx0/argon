# Roadmap: Argon

**Milestone:** v1.0 MVP (Hackathon Target)  
**Core Value:** Every briefing claim is mathematically grounded in and computed by the FalkorDB knowledge graph (traversals, PageRank/centrality, temporal predicates, and vector search) with 100% citation integrity—"no graph, no answer."

---

## Phase Overview

```
Phase 1: Database Schema & Vector Foundation
  └── Phase 2: Ingestion Pipeline & Decision Mining
        └── Phase 3: Query Gateway & Briefing Pipeline
              └── Phase 4: Next.js Frontend & Graph Canvas
                    └── Phase 5: Revert Backtest & Showcase Corpus
```

---

## Phase 1: Database Schema & Vector Foundation

**Goal:** Establish the monorepo foundation, define the FalkorDB openCypher schema with 512-d vector index, implement all 8 parameterized named queries, and verify local Transformers.js Node.js CPU embedding generation.

- **Plans:**
  4/4 plans complete

  - `01-02`: Author `schema.cypher` with constraints, node/edge types, and 512-d vector index.
  - `01-03`: Implement the 8 parameterized named queries in `packages/graph/queries/*.cypher`.
  - `01-04`: Build `packages/graph/embedding.ts` verifying Transformers.js EmbeddingGemma-2 on Node.js CPU with Matryoshka 512-d L2 re-normalization.
- **Deliverables:** `packages/graph` client, verified `.cypher` files, and embedding unit test.
- **Requirements Covered:** `GRAPH-01`, `GRAPH-02`, `EMB-01`, `VEC-01`.

---

## Phase 2: Ingestion Pipeline & Decision Mining

**Goal:** Implement the worker service that clones repositories, computes co-change coupling and components, identifies git reverts, extracts architectural decisions with temporal windows, and writes to FalkorDB using `(:IngestJob)` node tracking.

- **Plans:**
  4/4 plans complete

  - `02-01`: Implement `packages/ingest/git` for shallow/blobless clones, commit extraction, author mapping, and `TOUCHES` relationships.
  - `02-02`: Implement co-change coupling analysis and component grouping algorithm.
  - `02-03`: Implement markdown ADR/RFC and commit decision miner with `SUPERSEDES` and temporal validity handling.
  - `02-04`: Wire worker job runner with pure FalkorDB `IngestJob` status updates (`pending`, `mining`, `completed`, `failed`).
- **Deliverables:** `packages/ingest` pipeline capable of taking a git repository and populating a workspace graph.
- **Requirements Covered:** `JOB-01`, `ING-01`, `ING-02`, `ING-03`, `DEC-01`, `DEC-02`.

---

## Phase 3: Query Gateway & Briefing Pipeline

**Goal:** Expose read-only query endpoints via the gateway service, execute queries in parallel, run single-call Gemma 4 narration with Zod schema enforcement, enforce 100% citation integrity, and record write-back memory.

- **Plans:**
  - `03-01`: Build `apps/gateway` (Hono / Node.js) exposing authenticated endpoints for the 8 named queries using `GRAPH.RO_QUERY`.
  - `03-02`: Implement parallel multi-query execution dispatcher in `packages/agent`.
  - `03-03`: Implement Gemma 4 narration with Zod schema validation and retry parser for structured output reliability.
  - `03-04`: Implement citation integrity validator (drops uncited or invalid node claims) and `record_outcome` write-back memory.
- **Deliverables:** Working gateway and briefing generation engine with verifiable node citations.
- **Requirements Covered:** `GW-01`, `BRIEF-01`, `BRIEF-02`, `CITE-01`, `MEM-01`.

---

## Phase 4: Next.js Frontend & Graph Canvas

**Goal:** Build the user-facing web application featuring a unified command bar, contributor selector, brutalist 2077 tweakcn evidence cards, and an interactive Cytoscape.js canvas showing traversal paths behind claims.

- **Plans:**
  - `04-01`: Initialize Next.js App Router app (`apps/web`) with Tailwind CSS, shadcn/ui, and the 2077 theme.
  - `04-02`: Build the command bar interface, guest workspace switcher, and contributor selector ("Who am I").
  - `04-03`: Build the Briefing View with Evidence Cards linked to exact graph nodes and git sources.
  - `04-04`: Integrate Cytoscape.js canvas to render and highlight query traversal subgraphs with in-memory layout and "no graph, no answer" failure states.
- **Deliverables:** Full-featured interactive web application deployed to Vercel.
- **Requirements Covered:** `WS-01`, `UI-01`, `UI-02`, `UI-03`.

---

## Phase 5: Revert Backtest & Showcase Corpus

**Goal:** Build the automated backtest evaluation runner comparing historical revert recall against a no-graph baseline, and pre-index the showcase demonstration repositories for judging.

- **Plans:**
  - `05-01`: Build `packages/eval` backtest harness that rewinds the graph (`asOf`) to historical revert dates and computes recall@k.
  - `05-02`: Run and record the no-graph baseline benchmark for comparison.
  - `05-03`: Ingest and pre-index 2 curated public repositories (e.g. Astro / Ember with ADRs) plus an instant synthetic demo dataset.
  - `05-04`: Finalize README documentation, architecture diagrams, and demo script verification.
- **Deliverables:** Backtest benchmark report (for README / blog post) and preloaded demo workspace.
- **Requirements Covered:** `EVAL-01`.

---
*Roadmap defined: 2026-10-15*
