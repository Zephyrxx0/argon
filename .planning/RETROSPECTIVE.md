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

## Milestone: v2.0 — GitHub App Integration & Incremental Sync

**Shipped:** 2026-10-16  
**Phases:** 3 | **Plans:** 9 | **Tasks:** 17 verified | **Tests:** 273 passing

### What Was Built
- **Phase 6 (Authentication & Multi-Tenant Authorization):** Better Auth integration with GitHub OAuth and anonymous guest plugin in `apps/web`, stateless encrypted cookie sessions with HS256 JWT claims, openCypher `:User` and `[:ACCESSES]` schema, gateway `jwtAuthMiddleware` and `tenantAuthMiddleware` enforcing 403 Forbidden on unauthorized private workspaces, account linking openCypher migration, and sign-out state machine.
- **Phase 7 (Authenticated Ingestion & Private Repo Selector):** GitHubAppService with installation token generation and TTL caching, secret-scrubbed git transport (`http.extraheader` with Basic auth), centralized regex redaction of tokens across logs/errors/DB properties, searchable RepoPicker modal with debounced fuzzy filtering, and multi-factor identity linking (`(:User)-[:IDENTIFIES]->(:Person)`).
- **Phase 8 (Webhook Receiver & Incremental Sync Engine):** Timing-safe HMAC-SHA256 signature validator, 10,000 LRU delivery deduplication cache, async job dispatcher, atomic openCypher incremental mutation queries (`INCREMENTAL_SYNC_COMMITS_QUERY`, `UPDATE_ROLLING_COUPLING_QUERY`, `ADVANCE_ADR_SUPERSEDED_QUERY`), workspace-scoped Server-Sent Events stream (`GET /api/v1/workspaces/:workspaceId/events`), Cytoscape neon sync pulse & superseded ADR visual indicators, HUD live status pill, and stale briefing banner.

### What Worked
- **Anonymous Guest Auth + JWT:** Allowing users to seamlessly explore public showcase repositories without a mandatory GitHub login preserved zero-friction onboarding while enabling authenticated users to access private repositories.
- **Subprocess Stream Redaction:** Scrubbing credentials at the git transport layer using `-c http.extraheader` and wrapping all stream output in regex sanitizers ensured tokens never leaked into stdout, stderr, or FalkorDB error properties.
- **Atomic openCypher Mutations:** Using parameterized Cypher queries to ingest push events incrementally prevented expensive full repo re-clones and kept graph updates sub-second.
- **Workspace-Scoped SSE:** Server-Sent Events with heartbeat keepalives provided lightweight, real-time push capability without requiring heavier WebSocket infrastructure.

### What Was Inefficient
- **Next.js Rewrites vs CORS:** Web app API routing needed explicit Next.js rewrites to proxy `/api/v1/*` to the Hono gateway port cleanly in development without CORS complexity.
- **Docker Git Index Truncation:** Git index files occasionally zeroed out in Linux container environments under heavy parallel subagent IO, requiring index rebuilding.

### Patterns Established
- **Redaction-First Git Transport:** Never pass tokens in clone URLs (`https://x-access-token:...@github.com`); always use header-based injection with `GIT_TERMINAL_PROMPT=0`.
- **Temporal Decision Supersession:** Webhooks advancing `valid_to` timestamps dynamically deprecate obsolete ADRs in real time as PRs merge.
- **Live Graph Pulsing:** Visual feedback in Cytoscape canvases using transient animation classes (`synced-pulse`) immediately conveys background sync events to the user.

### Key Lessons
1. Multi-tenancy in graph databases is naturally modeled by adding identity nodes (`:User`) and access edges (`[:ACCESSES]`) directly into the knowledge graph rather than relying on secondary relational ACL tables.
2. Incremental sync requires atomicity; ingesting commits, touching files, and updating co-change weights in a single Cypher transaction guarantees graph consistency.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Tests | Key Change |
|---|---|---|---|---|
| v1.0 | 5 | 20 | 106 | Complete MVP architecture built from database schema to interactive frontend and empirical evaluation. |
| v2.0 | 3 | 9 | 273 | Added GitHub OAuth, multi-tenant authorization, private repo ingestion, HMAC webhooks, incremental sync, and SSE streaming. |

### Cumulative Quality

| Milestone | Tests | Passing | Test Coverage Focus |
|---|---|---|---|
| v1.0 | 106 | 100% | Unit, schema, embedding, gateway auth, citation verification, canvas sync, backtest metrics, and seeder. |
| v2.0 | 273 | 100% | Auth flows, guest anonymous sessions, FalkorDB multi-tenant isolation, secret redaction, HMAC webhooks, and incremental sync queries. |

### Top Lessons (Verified Across Milestones)

1. Grounding LLM outputs in mathematical graph traversals with 100% citation enforcement solves hallucination at the architectural level.
2. Modeling authentication, access control, and temporal validity directly within openCypher graphs simplifies architecture by eliminating secondary databases.


