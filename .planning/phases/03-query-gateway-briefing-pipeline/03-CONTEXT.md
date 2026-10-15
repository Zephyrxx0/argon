# Phase 3: Query Gateway & Briefing Pipeline - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose read-only query endpoints via the gateway service (`apps/gateway`) using Hono on Node.js, execute relevant FalkorDB queries in parallel, run single-call Gemma 4 narration with Zod schema enforcement, enforce 100% citation integrity (verifying node IDs exist in the active graph and dropping uncited claims), and record write-back memory (`(:Briefing)` nodes with `[:CITES]` and `[:ABOUT]` edges) in FalkorDB.

In scope:
- `apps/gateway` Hono HTTP application with modular routes (`/health`, `POST /api/v1/:workspaceId/query/:queryName`, `POST /api/v1/:workspaceId/briefing`)
- Bearer token authentication middleware with fail-closed security (`Authorization: Bearer <GATEWAY_SECRET>`), keeping `/health` public
- Strict 5-second per-query timeout handling returning HTTP 503 (`FALKORDB_TIMEOUT` / `FALKORDB_UNREACHABLE`)
- Dual-mode gateway client interface in `packages/agent`: `HttpGatewayClient` (for Next.js -> Cloud Run) and `DirectGraphGatewayClient` (in-process `packages/graph` queries for local dev, integration tests, and eval runner)
- Hybrid scope resolution: regex and path heuristics detect explicit file paths and component names for `resolveScope`, while natural language task text is embedded via `ArgonEmbedder` for `precedentSearch`
- Parallel query retrieval dispatcher in `packages/agent` running `blastRadius`, `whoKnows`, `constrainingDecisions`, and `precedentSearch` concurrently with `Promise.allSettled`
- Vector retrieval parameterization: top 5 decisions with task prefix formatting (`task: search result | query: ${text}`) and similarity cutoff >= 0.60
- Evidence payload bounding with hard count caps (max 15 files, 5 components, 5 owners, 5 constraining decisions, 3 precedents) before LLM prompt injection
- Single-call Gemma 4 narration (`gemma-4-31b-it` / `gemma-4-26b-a4b-it`) producing a structured 5-section `BriefingSchema` with `citedNodeIds: string[]` on every claim item
- Automated Zod validation repair loop (reprompts once with violation details on schema error)
- Rate limit (HTTP 429) resilience: 2 exponential backoff retries (1s, 2s) with automatic fallback to `gemini-2.5-flash-lite`
- Pre-narration short-circuit returning `NO_GRAPH_DATA` when parallel retrieval yields 0 files, 0 components, and 0 decisions
- Citation integrity validator: checks all `citedNodeIds` against retrieval evidence set (with FalkorDB fallback), stripping claims with unverified IDs
- "No graph, no answer" refusal: returns status `CITATION_INTEGRITY_FAILURE` if all claims are stripped or 0 verified citations remain
- Graph write-back memory function `record_outcome`: writes `(:Briefing)` node with `[:CITES]` edges to verified cited nodes, `[:ABOUT]` edges to touched components, and optional `[:REQUESTED]` edge to `(:Person)`

Out of scope:
- Next.js command bar UI, evidence cards, and Cytoscape.js canvas (Phase 4)
- Multi-step conversational follow-up agent loop (`ToolLoopAgent` - deferred to Phase 4 / stretch)
- Revert backtest evaluation runner and benchmark reporting (Phase 5)
- GitHub App webhook receiver and continuous sync (P1/P2 post-hackathon)
</domain>

<decisions>
## Implementation Decisions

### Gateway Architecture & Auth
- **D-01:** Granular named routes: `POST /api/v1/:workspaceId/query/:queryName` for the 8 queries, plus `POST /api/v1/:workspaceId/briefing` for full briefing generation. — **Reversibility:** costly — Gateway routing contract and client consumers (`apps/web`, `packages/agent`) depend on this endpoint structure.
- **D-02:** Standard `Authorization: Bearer <GATEWAY_SECRET>` header, failing closed (rejects 401 if unset or mismatched) with `/health` public. — **Reversibility:** reversible — Token verification middleware in Hono can be adjusted without changing route logic.
- **D-03:** Strict 5-second per-query timeout returning HTTP 503 with structured error code `FALKORDB_TIMEOUT` or `FALKORDB_UNREACHABLE` so the frontend triggers "no graph, no answer". — **Reversibility:** reversible — Timeout wrapper configuration in gateway route handler.
- **D-04:** Dual-mode client interface in `packages/agent`: `HttpGatewayClient` (Next.js -> Cloud Run) and `DirectGraphGatewayClient` (direct in-process `packages/graph` execution for local dev, integration tests, and eval runner). — **Reversibility:** costly — Core client abstraction used across test suites, evaluation scripts, and production web app.

### Parallel Retrieval & Scope Resolution
- **D-05:** Hybrid scope resolver in `packages/agent`: regex and path heuristics detect explicit file paths and component names for `resolveScope`, while natural language task text is embedded with `ArgonEmbedder` for `precedentSearch` in parallel. — **Reversibility:** costly — Determines how raw user command bar input is decomposed into graph queries.
- **D-06:** Core parallel retrieval bundle: Run `blastRadius` (on resolved files), `whoKnows` (on resolved components), `constrainingDecisions` (active as of query timestamp), and `precedentSearch` (vector query on task summary) concurrently using `Promise.allSettled`. — **Reversibility:** costly — Shapes the evidence bundle passed to the narration model.
- **D-07:** Parameterize `precedentSearch` vector retrieval for top 5 decisions with task prefix formatting (`task: search result | query: ${text}`) and minimum cosine similarity cutoff (>= 0.60) to suppress spurious matches. — **Reversibility:** reversible — Cutoff threshold and top-k are configuration constants.
- **D-08:** Hard count caps on evidence payload: max 15 touched files, max 5 blast-radius components, top 5 owners/reviewers, top 5 constraining decisions, top 3 precedent decisions before prompt injection to stay strictly within free-tier context limits. — **Reversibility:** reversible — Truncation bounds can be adjusted in evidence formatting helper.

### Gemma 4 Narration & Zod Schema
- **D-09:** Structured `BriefingSchema` with 5 typed sections (`summary`, `blastRadius`, `keyOwners`, `constrainingDecisions`, `precedents`) where each claim item explicitly includes `citedNodeIds: string[]`. — **Reversibility:** costly — Frontend presentation components and citation validator consume this exact schema.
- **D-10:** Narration execution via AI SDK `generateObject` (or `generateText` with structured schema prompt) targeting `gemma-4-31b-it` (or `gemma-4-26b-a4b-it`) with an automated Zod validation repair loop (reprompts once with violation details on schema error). — **Reversibility:** costly — Pipeline generator in `packages/agent`.
- **D-11:** Rate limit (HTTP 429) mitigation: 2 exponential backoff retries (1s, 2s) on 429, followed by automatic fallback to `gemini-2.5-flash-lite` via the same Google provider. — **Reversibility:** reversible — Retry / fallback handler in LLM provider wrapper.
- **D-12:** Pre-narration short-circuit: If parallel retrieval yields 0 files, 0 components, and 0 decisions, skip LLM call entirely and return status `"NO_GRAPH_DATA"` to guarantee zero hallucination and preserve quota. — **Reversibility:** reversible — Pre-flight check before narration call.

### Citation Integrity & Memory Write-back
- **D-13:** In-memory set check + FalkorDB fallback: Verify all `citedNodeIds` against the evidence bundle returned from the queries; drop any claim items containing unverified IDs. — **Reversibility:** costly — Core citation integrity validator in `packages/agent`.
- **D-14:** Enforce "no graph, no answer": If citation validation drops all claim items (0 verified citations remain), return status `"CITATION_INTEGRITY_FAILURE"` and refuse to present ungrounded assertions. — **Reversibility:** costly — Enforces PRD core value and hackathon judging criteria.
- **D-15:** Graph-native `(:Briefing)` node schema with `(:Briefing)-[:CITES]->(:Decision|:Component|:File)` edges to all verified cited nodes, and `(:Briefing)-[:ABOUT]->(:Component)`. — **Reversibility:** costly — Extends FalkorDB schema for memory write-back.
- **D-16:** Optional actor attribution on `(:Briefing)` write-back nodes: `(:Briefing { id, task, summary, actorId: contributorId ?? sessionId, created_at })`, linking `(:Person { id: contributorId })-[:REQUESTED]->(:Briefing)` if a contributor is selected. — **Reversibility:** reversible — Attribution properties on the Briefing node.

### the agent's Discretion
- Internal directory layout of `packages/agent` (`src/briefing/`, `src/client/`, `src/schemas/`, `src/citations/`).
- Specific prompt wording and template phrasing for Gemma 4 narration in `packages/agent/src/briefing/prompt.ts`.
- Exact HTTP status codes and response envelope format for query validation errors.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD and Architecture
- `PRD.md` §6.3 — Briefing and agent (FR-20 to FR-28)
- `PRD.md` §6.4 — Interface and failure states (FR-39 "no graph, no answer")
- `PRD.md` §7.3 — Named query specifications and contracts
- `PRD.md` §8 — System architecture (Vercel -> Cloud Run gateway -> Compute Engine FalkorDB)
- `PRD.md` §9.2-9.3 — AI SDK agent and Gemma 4 language model integration
- `PRD.md` §11.1-11.2 — Graph access security, `GRAPH.RO_QUERY`, and VPC network security
- `PRD.md` §14.2 — Repository layout (`apps/gateway/`, `packages/agent/`)
- `DECISIONS.md` §1 GD-02 — Cloud Run Gateway + Direct VPC egress
- `DECISIONS.md` §1 GD-04 — Deterministic Zod validation + retry loop over Gemma 4
- `DECISIONS.md` §1 GD-06 — Track 1 and Track 3 focus; write-back memory validation

### Codebase Interfaces
- `packages/graph/src/client.ts` — `ArgonGraphClient`, `roQuery`, and transaction handling
- `packages/graph/src/queries/index.ts` — 8 named query functions and `DualPayload<T>` type contracts
- `packages/graph/src/queries/types.ts` — Zod schemas and TypeScript types for all 8 queries
- `packages/graph/src/embedding/embedder.ts` — `ArgonEmbedder`, query formatting, and 512-d Matryoshka vectorization

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/graph/src/queries/index.ts`: Exposes all 8 named queries (`resolveScope`, `blastRadius`, `riskRanking`, `whoKnows`, `constrainingDecisions`, `precedentSearch`, `pathBetween`, `componentOverview`) with pre-validated Zod parameter schemas and Cytoscape conversion.
- `ArgonGraphClient`: Reusable Redis connection manager with `roQuery(workspaceId, cypher, params)` and `query(workspaceId, cypher, params)`.
- `ArgonEmbedder` in `packages/graph`: Embeds text strings into 512-d normalized float vectors using Transformers.js with automatic Gemini API fallback.
- `DualPayload<T>` in `packages/graph/src/queries/types.ts`: Standard container returning `{ data: T, cytoscape: CytoscapeElement[] }`.

### Established Patterns
- All read queries run strictly via `GRAPH.RO_QUERY`.
- Vector embeddings use Matryoshka 512-d truncation with L2 normalization (`norm = 1.0`).
- No secondary databases: FalkorDB is the single store for knowledge, jobs, and memory.
- Every claim must map to verified graph node IDs.

### Integration Points
- `apps/gateway` imports `packages/graph` directly to execute queries against FalkorDB.
- `packages/agent` implements the briefing engine, consumable by `apps/web` (Next.js) or `apps/gateway`.
- `packages/eval` in Phase 5 will use `packages/agent`'s `DirectGraphGatewayClient` to run backtest benchmarks against historical states.

</code_context>

<specifics>
## Specific Ideas

- Strict "No Graph, No Answer" Verification: Returning HTTP 503 or `NO_GRAPH_DATA` when FalkorDB is unreachable or empty prevents AI hallucinations during judging and satisfies the core hackathon kill-switch requirement.
- Clean Separation of Concerns: `apps/gateway` remains a lightweight, high-performance Hono proxy for FalkorDB queries, while `packages/agent` encapsulates all LLM orchestration, citation integrity checking, and write-back memory logic.

</specifics>

<deferred>
## Deferred Ideas

- None — all decisions stayed strictly within Phase 3 scope.

</deferred>

---

*Phase: 3-Query Gateway & Briefing Pipeline*
*Context gathered: 2026-10-15*

