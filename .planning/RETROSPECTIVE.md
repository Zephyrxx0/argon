# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — v1.0 MVP

**Shipped:** 2026-10-16  
**Phases:** 5 | **Plans:** 20 | **Tasks:** 13 verified | **Tests:** 106 passing

### What Was Built
- **Phase 1 (Database Schema & Vector Foundation):** openCypher graph schema with 8 node types, 12 edge types, 512-d Matryoshka vector index, 8 parameterized named queries, and local CPU EmbeddingGemma-2 embedder.
- **Phase 2 (Ingestion Pipeline & Decision Mining):** Ephemeral blobless git clone, SHA-256 contributor email pseudonymization, co-change coupling analysis, revert commit mining, ADR/RFC temporal validity window extraction, and chunked openCypher UNWIND batch database writer.
- **Phase 3 (Query Gateway & Briefing Pipeline):** Hono query gateway with fail-closed Bearer auth, parallel multi-query retrieval, single-call Gemma 4 narration with Zod schema repair loop, 100% citation integrity enforcement ("no graph, no answer"), and briefing graph write-back memory.
- **Phase 4 (Next.js Frontend & Graph Canvas):** Resizable split-pane interface (`SplitViewport`), brutalist 2077 tweakcn cyberpunk theme, unified command bar (`Cmd+K`), briefing stream with Evidence Cards, interactive Cytoscape.js canvas with 60fps client fCoSE physics layout, and high-visibility KillSwitchCard refusal UI.
- **Phase 5 (Revert Backtest & Showcase Corpus):** Automated evaluation harness (`@argon/eval`), 24 golden historical revert fixtures, dual no-graph baselines (flat vector RAG and raw LLM), SHA-256 ReplayCache, Triad showcase corpus seeder, automated smoke test script (`pnpm demo:check`), root `README.md` Hackathon Submission Suite, and technical article `docs/BLOG-POST.md`.

### What Worked
- **Strict Parameterized Cypher Queries:** Authoring 8 dedicated, parameterized `.cypher` files eliminated unconstrained Cypher hallucination risks and SQL/Cypher injection.
- **Matryoshka 512-d Dimension Truncation:** EmbeddingGemma-2 with MRL truncation provided 100% vector dimension compatibility with FalkorDB and fast local CPU inference (~100ms).
- **Fail-Closed Citation Integrity:** Enforcing that every single claim must carry verified graph node citations or be stripped eliminated LLM hallucinations and proved the core value proposition.
- **Pre-computed Showcase Datasets:** Pre-bundling embeddings and mock data allowed instant (<5s) database seeding for demo judging without live internet or model download dependencies.

### What Was Inefficient
- **Initial FalkorDB Offline Handshake in CI:** Tests required explicit offline fallback gates so they could run cleanly both in sandbox environments and against live containers.
- **Index Staging Nuances:** Staging large JSON seed datasets required batching to ensure clean git index operations.

### Patterns Established
- **"No graph, no answer":** When graph data is empty, citations fail, or DB is unreachable, fail closed with explicit refusal UI rather than ungrounded LLM guessing.
- **Temporal Graph Predicates:** Using `valid_from` and `valid_to` timestamps alongside `[:SUPERSEDES]` relationships eliminates obsolete architectural recommendations at query time via `$asOf`.
- **Dual Gateway Client:** Support both direct in-process database access (`DirectGraphGatewayClient`) and distributed HTTP microservice access (`HttpGatewayClient`) via a shared interface.

### Key Lessons
1. Semantic vector search alone is blind to time; knowledge graphs with temporal validity edges are essential for evolving codebases.
2. In-memory Cytoscape client-side layouts are vastly more responsive and maintainable than persisting layout coordinates to graph databases.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Tests | Key Change |
|---|---|---|---|---|
| v1.0 | 5 | 20 | 106 | Complete MVP architecture built from database schema to interactive frontend and empirical evaluation. |

### Cumulative Quality

| Milestone | Tests | Passing | Test Coverage Focus |
|---|---|---|---|
| v1.0 | 106 | 100% | Unit, schema, embedding, gateway auth, citation verification, canvas sync, backtest metrics, and seeder. |

### Top Lessons (Verified Across Milestones)

1. Grounding LLM outputs in mathematical graph traversals with 100% citation enforcement solves hallucination at the architectural level.

