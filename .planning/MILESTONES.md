# Milestones

## v2.0 GitHub App Integration & Incremental Sync (Shipped: 2026-10-16)

**Phases completed:** 3 phases, 9 plans, 17 tasks

**Key accomplishments:**

- Better Auth integration with GitHub OAuth, anonymous guest session auto-minting, HS256 JWT issuance, and FalkorDB multi-tenant `:User` / `[:ACCESSES]` isolation gates with pre-query 403 Forbidden authorization.
- Secret-scrubbed git transport with short-lived GitHub App installation tokens, credential redaction across logs and FalkorDB `(:IngestJob.error)`, and canary leak test suites.
- Searchable GitHub repository picker dialog with debounced fuzzy filtering, tabbed IngestModal ("Your Repositories" vs "Public Git URL"), and authenticated user identity linking (`(:User)-[:IDENTIFIES]->(:Person)`).
- Timing-safe HMAC-SHA256 webhook verification with LRU delivery deduplication cache and asynchronous background sync job queue in `apps/gateway`.
- Atomic incremental openCypher sync engine updating modified files, author touches, rolling co-change coupling, and ADR temporal supersession windows (`valid_from`, `valid_to`) without full repository re-clones.
- Workspace-scoped Server-Sent Events (SSE) streaming with live Cytoscape neon pulse animation, HUD sync status indicator, and stale briefing invalidation alerts.

---

## v1.0 v1.0 MVP (Shipped: 2026-10-16)

**Phases completed:** 5 phases, 20 plans, 13 tasks

**Key accomplishments:**

- Established pnpm workspaces and Turborepo pipeline, created `@argon/tsconfig`, scaffolded `apps/web` with Next.js 15 and Tailwind CSS v4 brutalist tokens, and provisioned FalkorDB container orchestration.
- Implemented `ArgonGraphClient` with 5000ms query timeouts, typed `FalkorUnavailableError` ("no graph, no answer" refusal contract), and `roQuery` safety. Authored `schema.cypher` and implemented idempotent `initWorkspaceGraph` with 512-d cosine vector index, CLI migration tool, and integration tests.
- 01-03
- Implemented `ArgonEmbedder` with Transformers.js on Node.js CPU using EmbeddingGemma-2 (`q8`), 512-dimensional Matryoshka Representation Learning (MRL) truncation, strict unit $L_2$ re-normalization, transparent Google Gemini fallback, and a 10-test Vitest validation suite.
- 2026-10-15
- 2026-10-15
- 2026-10-15
- 2026-10-15
- 2026-10-15
- 2026-10-15
- 2026-10-15
- 2026-10-15
- v1.0 MVP
- v1.0 MVP
- v1.0 MVP
- v1.0 MVP
- 2026-10-16
- 2026-10-16

---
