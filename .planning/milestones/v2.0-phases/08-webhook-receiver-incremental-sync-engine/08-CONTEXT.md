# Phase 8: Webhook Receiver & Incremental Sync Engine - Context

**Gathered:** 2026-10-16  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Phase 8 implements real-time GitHub webhook reception and incremental knowledge graph synchronization in Argon. This encompasses:
1. HMAC-SHA256 verified webhook listener in `apps/gateway` (`POST /api/v1/webhooks/github`) with timing-safe signature authentication, in-memory LRU delivery deduplication, and immediate 202 acknowledgment.
2. Incremental commit and co-change coupling ingestion in FalkorDB without full repository re-clones, mining authors, file touches, file deletions (`deleted: true`), and `(:Commit)-[:REVERTS]->(:Commit)` relationships.
3. Automated ADR supersession detection on merged PRs, advancing `valid_to` timestamps on superseded decisions, minting new `(:Decision)` nodes with inline EmbeddingGemma-2 512-d embeddings, and establishing `[:GOVERNS]` relationships.
4. Real-time event streaming over Server-Sent Events (SSE) scoped by workspace (`GET /api/v1/workspaces/:workspaceId/events`), triggering live Cytoscape neon pulse animations, HUD sync status badge updates, and active briefing staleness alerts.

</domain>

<decisions>
## Implementation Decisions

### 1. Webhook Ingestion & Signature Verification (SYNC-01)
- **D-01:** Webhooks terminate at a dedicated `POST /api/v1/webhooks/github` route in `apps/gateway` verified against a global `GITHUB_WEBHOOK_SECRET` environment variable using timing-safe HMAC-SHA256 (`crypto.timingSafeEqual`). If a repository has no corresponding workspace in FalkorDB, respond `200 OK` with `{ ignored: true, reason: 'untracked_repository' }`. — **Reversibility:** costly — Defines public webhook endpoint contract and gateway security middleware.
- **D-02:** In-memory LRU cache storing the last 10,000 `X-GitHub-Delivery` GUIDs provides $O(1)$ delivery deduplication, paired with openCypher `MERGE` idempotency on commit SHAs and decision IDs to prevent duplicate mutations across gateway restarts. — **Reversibility:** reversible — Gateway in-memory cache configuration and delivery check.
- **D-03:** Event filtering strictly accepts `push` events to the repository's default branch (`refs/heads/main` or `master`) and `pull_request` events with `action === 'closed' && pull_request.merged === true`. All other actions (draft PRs, feature branch pushes) are acknowledged and ignored to preserve canonical workspace topology. — **Reversibility:** reversible — Route handler event routing logic.
- **D-04:** Decoupled execution lifecycle: gateway verifies HMAC, checks delivery cache, and filters branch synchronously, immediately returning HTTP `202 Accepted` (`{ status: 'queued', deliveryId }`) in <50ms. Graph mutations execute asynchronously tracked by FalkorDB `(:IngestJob { type: 'incremental_sync' })` state, eliminating GitHub 10s webhook timeout risks. — **Reversibility:** costly — Orchestrates async job queuing and execution in gateway.

### 2. Incremental Commit & Graph Mutation (SYNC-02)
- **D-05:** Zero-git-subprocess ingestion: newly pushed commits, authors, timestamps, and added/modified/removed file paths are extracted directly from the webhook payload's `commits[]` array. Octokit `repos.getContent()` is called only when reading specific file contents (such as modified ADR markdown). — **Reversibility:** one-way — Eliminates local git clones and git fetch subprocesses for incremental sync.
- **D-06:** Atomic parameterized openCypher query (`INCREMENTAL_SYNC_COMMITS`) with `UNWIND` batches mutations for all pushed commits and file touches in a single transaction, merging `(:Person)`, `(:Commit)`, `(:File)`, `[:AUTHORED]`, and `[:TOUCHES]`, and triggering Phase 7 identity linker `(:User)-[:IDENTIFIES]->(:Person)`. — **Reversibility:** costly — Core openCypher graph mutation query in `packages/graph` / `packages/ingest`.
- **D-07:** Rolling pairwise co-change coupling: for commits touching $\le 50$ files (matching the established Phase 2 churn filter), an incremental Cypher query updates `[:CO_CHANGES_WITH]` edges between co-touched file pairs by incrementing `count = count + 1` and recalculating weight. — **Reversibility:** costly — Graph writer algorithm for rolling blast radius calculation.
- **D-08:** Deleted file lifecycle & revert tracking: files removed in a push are marked with `(:File { deleted: true, deleted_at: timestamp })` without deleting historical node connections, and commit messages are scanned with `packages/ingest/src/mining/reverts.ts` regex to establish `(:Commit)-[:REVERTS]->(:Commit)` edges. — **Reversibility:** one-way — openCypher schema convention and revert backtest query compatibility.

### 3. ADR Supersession & Temporal Validity (SYNC-03)
- **D-09:** PR file diff inspection: on merged pull requests, call Octokit `pulls.listFiles({ pull_number })` to detect modified or added markdown files matching ADR glob patterns (`docs/adr/**/*.md`, `docs/decisions/**/*.md`, `decisions/**/*.md`). If matches exist, fetch raw content via Octokit `repos.getContent()` and parse structured decisions via `packages/ingest/src/mining/adr.ts`. — **Reversibility:** reversible — File path pattern matching and parser invocation.
- **D-10:** Temporal window advancement: when an ADR supersedes an existing decision, set the superseded `(:Decision)` node's `valid_to = pr.merged_at`, set the new `(:Decision)` node's `valid_from = pr.merged_at`, and create the directed edge `(new:Decision)-[:SUPERSEDES]->(old:Decision)`. Ensures historical `asOf` time-travel queries accurately resolve decisions active at any point in time. — **Reversibility:** one-way — Mathematical temporal validity schema contract across FalkorDB and briefing engine.
- **D-11:** Inline in-process embedding: new or updated decisions generate 512-d embeddings inline within the async sync job using EmbeddingGemma-2 on CPU via `@argon/graph` embedder (~150ms), ensuring new decisions are immediately indexed and retrievable via vector similarity queries. — **Reversibility:** costly — Dependency on Transformers.js CPU embedder in gateway worker.
- **D-12:** Dual governance linking: extract explicit relative file paths cited within the ADR text to create `(:Decision)-[:GOVERNS]->(:File)`. If no explicit paths are cited, fall back to linking the decision to all code files modified in the merged pull request, guaranteeing zero disconnected decision nodes. — **Reversibility:** reversible — Graph link heuristic logic.

### 4. Real-Time Canvas Sync & Client Notification (SYNC-03)
- **D-13:** Server-Sent Events (SSE) streaming endpoint at `GET /api/v1/workspaces/:workspaceId/events` in `apps/gateway` delivers real-time notifications to active web clients. Enforces Phase 6 tenant JWT authorization and workspace access checks, with a 15-second heartbeat keepalive. — **Reversibility:** one-way — Real-time event streaming protocol between gateway and web clients.
- **D-14:** Structured delta event schema: on sync completion, emit `sync:complete` containing `{ workspaceId, trigger, updated: { commits: string[], files: string[], decisions: string[] }, superseded: string[] }`, allowing the client to highlight exact affected nodes without refetching the entire graph or causing layout displacement. — **Reversibility:** costly — Event schema consumed by Cytoscape canvas and notification handlers.
- **D-15:** Dual canvas pulse & HUD feedback: Cytoscape animates an expanding neon cyan/amber ripple on updated nodes and transitions superseded decisions into dimmed dashed borders. Concurrently, `HUDControls` displays a temporary monospace status badge (`LIVE SYNC • +N commits, N ADR superseded`) for 5 seconds. — **Reversibility:** reversible — UI presentation and Cytoscape animation styling.
- **D-16:** Non-destructive graph merge & stale briefing banner: client appends new nodes and edges into Cytoscape via `cy.add()` with localized animation, preserving current camera zoom/pan and node inspection state. If the active briefing cited any updated files or superseded decisions, display a non-blocking alert banner in `BriefingView`: *"Repository updated since briefing was generated. [Refresh Briefing]"*. — **Reversibility:** reversible — Client state management and briefing view banner.

### the agent's Discretion
- Exact easing curve parameters and duration for the Cytoscape expanding ring pulse animation (default 1200ms cubic-bezier).
- Internal structured log format for webhook receipt and sync job completion.
- Exact regex pattern list for detecting ADR markdown file paths across varying repository conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture & Requirements
- `.planning/PROJECT.md` — Core values, architecture constraints, and tech stack guidelines.
- `.planning/REQUIREMENTS.md` — Requirements SYNC-01 (HMAC Webhook), SYNC-02 (Incremental Commit Sync), and SYNC-03 (ADR Supersession & Live Pulse).
- `.planning/ROADMAP.md` §Phase 8 — Scope, goal, and success criteria for Phase 8.
- `.planning/v2.0-MILESTONE-SPEC.md` §2 & §3 — Milestone v2.0 specification for webhook listener and incremental sync engine.
- `.planning/phases/06-authentication-multi-tenant-authorization/06-CONTEXT.md` — Phase 6 context for JWT bearer auth, tenant authorization middleware, and FalkorDB `:User` / `[:ACCESSES]` isolation.
- `.planning/phases/07-authenticated-ingestion-private-repo-selector/07-CONTEXT.md` — Phase 7 context for GitHub App service, installation token generation, secret redaction, and `(:User)-[:IDENTIFIES]->(:Person)` linking.

### Codebase Implementations
- `apps/gateway/src/app.ts` — Hono application instance, route registrations, and middleware mounting.
- `apps/gateway/src/services/github-app.ts` — GitHub App authentication service and Octokit client minting.
- `apps/gateway/src/middleware/tenant-auth.ts` — Workspace tenant authorization middleware.
- `packages/graph/src/schema/schema.cypher` — FalkorDB graph schema definition, constraints, and indices.
- `packages/graph/src/embedding/embedder.ts` — EmbeddingGemma-2 512-d CPU embedding generator.
- `packages/ingest/src/writer/queries.ts` — OpenCypher batch write queries for commits, authors, files, and touches.
- `packages/ingest/src/coupling/cochange.ts` — Co-change coupling calculation logic and churn filters.
- `packages/ingest/src/mining/adr.ts` — Architectural Decision Record markdown parser and supersession extractor.
- `packages/ingest/src/mining/reverts.ts` — Git revert commit message regex miner.
- `apps/web/components/canvas/cytoscape-canvas.tsx` — Cytoscape canvas component and event listeners.
- `apps/web/components/canvas/stylesheet.ts` — Cyberpunk Cytoscape styles and node state selectors.
- `apps/web/components/canvas/hud-controls.tsx` — Canvas HUD controls bar for status badges.
- `apps/web/components/briefing/briefing-view.tsx` — Briefing display view with evidence cards.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/gateway/src/services/github-app.ts`: Provides `getInstallationOctokit(installationId)` with TTL token caching, ready for fetching PR file lists and ADR contents.
- `packages/ingest/src/mining/adr.ts`: `parseAdrContent()` parses title, status, context, decision, and supersession links from markdown.
- `packages/ingest/src/mining/reverts.ts`: Regex parser for identifying git revert commits.
- `packages/graph/src/embedding/embedder.ts`: `generateEmbedding()` for computing 512-d vector embeddings in Node.js CPU.
- `apps/web/components/canvas/traversal-animator.ts`: Animation helpers for Cytoscape elements.

### Established Patterns
- Monorepo package management via `pnpm` and Turborepo.
- Monospace dark aesthetic (`font-mono`, `bg-card/95`, `backdrop-blur-md`, `border-border`, cyan/neon-amber accents).
- Pure FalkorDB parameterized openCypher queries preventing injection and external datastore requirements.
- Timing-safe HMAC verification matching ASVS Level 1 security standards.

### Integration Points
- `apps/gateway/src/routes/webhooks.ts`: New route handler for `POST /api/v1/webhooks/github`.
- `apps/gateway/src/routes/events.ts`: New SSE streaming route for `GET /api/v1/workspaces/:workspaceId/events`.
- `apps/gateway/src/services/incremental-sync.ts`: Core synchronization service orchestrating commit and ADR ingestion.
- `packages/graph/src/queries/sync.ts`: OpenCypher queries for incremental commits, rolling coupling, and ADR supersession.
- `apps/web/lib/graph-sync.tsx` / `apps/web/components/canvas/cytoscape-canvas.tsx`: Client-side SSE listener and `synced-pulse` animation trigger.
- `apps/web/components/briefing/briefing-view.tsx`: Invalidation notice when an active briefing's citations are modified.

</code_context>

<specifics>
## Specific Ideas
- In `POST /api/v1/webhooks/github`, immediately return `202 Accepted` within 50ms so GitHub never times out or flags delivery failure.
- In Cytoscape, animate the sync pulse with a bright cyan expanding ring, while superseded ADRs fade into dimmed dashed borders so users visually see decision deprecation in real time.
- Display a sleek monospace badge in `HUDControls`: `LIVE SYNC • +3 commits, 1 ADR superseded` that auto-dismisses after 5 seconds.
- In `BriefingView`, alert the user if their active briefing's cited files or ADRs were modified by an incoming sync.

</specifics>

<deferred>
## Deferred Ideas

- **ORG-01 (v3.0):** Multi-user organization team spaces with role-based access control.
- **CROSS-01 (v3.0):** Cross-repository multi-graph dependency and shared library impact analysis.
- **SLACK-01 (v3.0):** Slack bot integration triggering Argon briefings directly from PR comments.

</deferred>

---

*Phase: 8-Webhook Receiver & Incremental Sync Engine*  
*Context gathered: 2026-10-16*

