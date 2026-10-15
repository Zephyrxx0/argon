# Phase 3: Query Gateway & Briefing Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 3-Query Gateway & Briefing Pipeline
**Areas discussed:** Gateway Architecture & Auth, Parallel Retrieval & Scope Resolution, Gemma 4 Narration & Zod Schema, Citation Integrity & Memory Write-back

---

## Gateway Architecture & Auth

| Option | Description | Selected |
|--------|-------------|----------|
| Granular named routes | POST /api/v1/:workspaceId/query/:queryName for the 8 queries, plus POST /api/v1/:workspaceId/briefing for full briefing generation | ✓ |
| Unified dispatch route | POST /api/v1/:workspaceId/query with body { query: string, params: object } plus briefing route | |
| Flat RPC routes | Dedicated endpoints like /api/v1/:workspaceId/resolve-scope, /blast-radius, etc. | |

**User's choice:** (Recommended) Granular named routes: POST /api/v1/:workspaceId/query/:queryName for the 8 queries, plus POST /api/v1/:workspaceId/briefing for full briefing generation.  
**Notes:** Provides clean REST semantics for each named query contract while isolating briefing generation.

| Option | Description | Selected |
|--------|-------------|----------|
| Bearer token header | Standard Authorization: Bearer <GATEWAY_SECRET> header, failing closed (rejects 401 if unset or mismatched) with /health public | ✓ |
| Custom header | Custom header x-argon-key with fail-closed rejection and /health public | |
| Production Bearer + dev bypass | Bearer token in production with an explicit GATEWAY_AUTH_DISABLED=true flag allowed for local development/offline testing | |

**User's choice:** (Recommended) Standard Authorization: Bearer <GATEWAY_SECRET> header, failing closed (rejects 401 if unset or mismatched) with /health public.  
**Notes:** Fail-closed design ensures ports and endpoints are secure by default.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict 5s timeout | Strict 5-second per-query timeout returning HTTP 503 with structured code FALKORDB_TIMEOUT or FALKORDB_UNREACHABLE so the frontend triggers "no graph, no answer" | ✓ |
| 10s timeout + retry | 10-second timeout with 1 automatic retry on connection reset before failing with 503 | |
| Pass-through header | Pass-through timeout configurable via header (default 5s, max 15s) with generic 500 on timeout | |

**User's choice:** (Recommended) Strict 5-second per-query timeout returning HTTP 503 with structured code FALKORDB_TIMEOUT or FALKORDB_UNREACHABLE so the frontend triggers "no graph, no answer".  
**Notes:** Fast-failing prevents hanging frontend sessions and triggers the required kill-switch behavior.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-mode client interface | HttpGatewayClient (Next.js -> Cloud Run) and DirectGraphGatewayClient (direct in-process packages/graph execution for local dev and eval runner) | ✓ |
| HTTP-only client everywhere | All tests and eval scripts must run a local Hono gateway process on localhost | |
| Direct client everywhere | Gateway only used as an HTTP proxy wrapper for external clients | |

**User's choice:** (Recommended) Dual-mode client interface: HttpGatewayClient (Next.js -> Cloud Run) and DirectGraphGatewayClient (direct in-process packages/graph execution for local dev and eval runner).  
**Notes:** Eliminates the need to spawn background HTTP servers during headless CI or evaluation backtests while supporting remote Cloud Run gateway in production.

---

## Parallel Retrieval & Scope Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid resolver | Regex/path heuristics detect explicit files and components for resolveScope, while natural language text is embedded with ArgonEmbedder for precedentSearch in parallel | ✓ |
| Vector-first resolver | Always embed the input text first to find initial entry files and components in FalkorDB, then expand traversals | |
| Explicit typed payload | The frontend command bar must parse and flag the input type (file, component, diff, or free-text task) before calling the gateway | |

**User's choice:** (Recommended) Hybrid resolver: Regex/path heuristics detect explicit files and components for resolveScope, while natural language text is embedded with ArgonEmbedder for precedentSearch in parallel.  
**Notes:** Maximizes usability by allowing users to enter a file, component, or task string freely without manual mode switching.

| Option | Description | Selected |
|--------|-------------|----------|
| Core parallel bundle | Run blastRadius, whoKnows, constrainingDecisions (active now), and precedentSearch concurrently using Promise.allSettled | ✓ |
| Full 8-query sweep | Execute all 8 named queries including global riskRanking and componentOverview on every request | |
| Two-stage pipeline | First resolveScope, then only run queries where resolved files or components were found | |

**User's choice:** (Recommended) Core parallel bundle: Run blastRadius, whoKnows, constrainingDecisions (active now), and precedentSearch concurrently using Promise.allSettled.  
**Notes:** All graph evidence is gathered in a single round-trip burst before calling the narration model.

| Option | Description | Selected |
|--------|-------------|----------|
| Top 5 with cutoff | Top 5 decisions with task prefix formatting (task: search result \| query: ${text}) and min similarity score cutoff (>= 0.60) to suppress spurious matches | ✓ |
| Top 10 unfiltered | Top 10 decisions without score filtering, leaving relevance filtering entirely to the narration model | |
| Top 3 component-filtered | Top 3 decisions strictly filtered to match only components present in the blast radius | |

**User's choice:** (Recommended) Top 5 decisions with task prefix formatting (task: search result \| query: ${text}) and min similarity score cutoff (>= 0.60) to suppress spurious matches.  
**Notes:** Conforms to EmbeddingGemma-2 required task prefix and prevents noise from polluting LLM context.

| Option | Description | Selected |
|--------|-------------|----------|
| Hard count caps | Max 15 touched files, max 5 blast-radius components, top 5 owners/reviewers, top 5 constraining decisions, top 3 precedent decisions | ✓ |
| Dynamic token allocator | Calculate character length and truncate lower-priority lists if total evidence payload exceeds ~3,000 tokens | |
| Uncapped evidence | Send all returned graph query rows directly into the narration prompt, relying on Gemma's context window | |

**User's choice:** (Recommended) Hard count caps per evidence category: max 15 touched files, max 5 blast-radius components, top 5 owners/reviewers, top 5 constraining decisions, top 3 precedent decisions.  
**Notes:** Guarantees deterministic, predictable context sizes under free-tier quotas.

---

## Gemma 4 Narration & Zod Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Structured BriefingSchema | 5 typed sections (summary, blastRadius, keyOwners, constrainingDecisions, precedents) where each claim item explicitly includes citedNodeIds: string[] | ✓ |
| Markdown-first schema | Single synthesized markdown summary with a separate array of citations [{ claim: string, nodeId: string }] | |
| Card-based schema | An array of evidence cards with title, category, description, and source node IDs | |

**User's choice:** (Recommended) Structured BriefingSchema: 5 typed sections (summary, blastRadius, keyOwners, constrainingDecisions, precedents) where each claim item explicitly includes citedNodeIds: string[].  
**Notes:** Enables seamless rendering into specialized brutalist UI cards while enforcing citations per claim item.

| Option | Description | Selected |
|--------|-------------|----------|
| AI SDK generateObject + repair loop | AI SDK generateObject (or generateText with structured schema prompt) targeting gemma-4-31b-it with an automated Zod validation repair loop (1 reprompt on schema violation) | ✓ |
| Standard JSON mode | Standard JSON mode prompt with manual JSON.parse + Zod parse, failing immediately with 500 on validation error without reprompt | |
| ToolLoopAgent multi-turn | AI SDK ToolLoopAgent multi-turn loop where the LLM queries the gateway tools itself instead of receiving pre-fetched evidence | |

**User's choice:** (Recommended) AI SDK generateObject (or generateText with structured schema prompt) targeting gemma-4-31b-it with an automated Zod validation repair loop (1 reprompt on schema violation).  
**Notes:** Deterministic single-call model with repair resilience prevents failed responses without wasting multi-step quotas.

| Option | Description | Selected |
|--------|-------------|----------|
| Backoff + Fallback model | 2 exponential backoff retries (1s, 2s) on 429, followed by automatic fallback to gemini-2.5-flash-lite via the same Google provider | ✓ |
| Fail-fast with retry countdown | On 429, immediately return HTTP 429 with Retry-After header for the frontend to show a countdown | |
| In-memory token bucket queue | Throttle all LLM requests to max 15 requests/minute globally using a token bucket queue | |

**User's choice:** (Recommended) Backoff + Fallback model: 2 exponential backoff retries (1s, 2s) on 429, followed by automatic fallback to gemini-2.5-flash-lite via the same Google provider.  
**Notes:** Ensures robust live demo reliability even if AI Studio free-tier quotas are momentarily saturated.

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-narration short-circuit | If parallel retrieval yields 0 files, 0 components, and 0 decisions, skip LLM entirely and return status: "NO_GRAPH_DATA" to guarantee zero hallucination | ✓ |
| Prompt-level refusal | Send empty evidence to Gemma 4 with instructions to respond with an empty briefing and a refusal statement | |
| Fallback web search | When no graph nodes match, provide general guidance based on LLM pretraining | |

**User's choice:** (Recommended) Pre-narration short-circuit: If parallel retrieval yields 0 files, 0 components, and 0 decisions, skip LLM entirely and return status: "NO_GRAPH_DATA" to guarantee zero hallucination.  
**Notes:** Guarantees zero hallucinations and upholds the core principle: "no graph, no answer".

---

## Citation Integrity & Memory Write-back

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory check + FalkorDB fallback | Verify all citedNodeIds against the evidence bundle returned from the queries; drop any claim items containing unverified IDs | ✓ |
| Strict rejection & reprompt | If any cited node ID is missing from the graph, reject the entire briefing output and reprompt Gemma 4 once with the violation error | |
| Annotate invalid citations | Preserve the text but flag citationValid: false on ungrounded claims in the UI | |

**User's choice:** (Recommended) In-memory set check + FalkorDB fallback: Verify all citedNodeIds against the evidence bundle returned from the queries; drop any claim items containing unverified IDs.  
**Notes:** Enforces 100% citation validity by stripping uncited or hallucinated statements before presenting to the user.

| Option | Description | Selected |
|--------|-------------|----------|
| Enforce "no graph, no answer" | If citation validation drops all claim items (0 verified citations remain), return status CITATION_INTEGRITY_FAILURE and refuse to answer | ✓ |
| Raw evidence fallback | If all narrative claims are stripped, present the raw query results (tables/cards) directly without AI narration | |
| Allow ungrounded summary | Require citations for component/decision claims, but permit the high-level summary to stand without citations | |

**User's choice:** (Recommended) Enforce "no graph, no answer": If citation validation drops all claim items (0 verified citations remain), return status CITATION_INTEGRITY_FAILURE and refuse to answer.  
**Notes:** Hard stop if zero valid citations survive, preventing ungrounded speculation.

| Option | Description | Selected |
|--------|-------------|----------|
| Graph-native Briefing node | Graph-native (:Briefing) node with (:Briefing)-[:CITES]->(:Decision\|:Component\|:File) edges to all verified cited nodes, and (:Briefing)-[:ABOUT]->(:Component) | ✓ |
| Single blob node | (:Briefing { id, task, raw_json, created_at }) without CITES or ABOUT edges | |
| Store on feedback only | Store memory only when explicit user feedback is given (thumbs up/down) in the UI | |

**User's choice:** (Recommended) Graph-native (:Briefing) node with (:Briefing)-[:CITES]->(:Decision|:Component|:File) edges to all verified cited nodes, and (:Briefing)-[:ABOUT]->(:Component).  
**Notes:** Makes briefings queryable inside FalkorDB itself, enabling historical memory traversals.

| Option | Description | Selected |
|--------|-------------|----------|
| Optional actor attribution | (:Briefing { id, task, summary, actorId: contributorId ?? sessionId, created_at }), linking (:Person { id: contributorId })-[:REQUESTED]->(:Briefing) if contributor is selected | ✓ |
| Mandatory contributor | Require the user to select an existing contributor from the repo before writing memory | |
| Pure anonymous | Do not record any actor or session identifier on Briefing nodes | |

**User's choice:** (Recommended) Optional actor attribution: (:Briefing { id, task, summary, actorId: contributorId ?? sessionId, created_at }), linking (:Person { id: contributorId })-[:REQUESTED]->(:Briefing) if contributor is selected.  
**Notes:** Accommodates guest mode seamlessly with browser sessionId fallback while connecting to real Person nodes when selected.

---

## the agent's Discretion

- Exact file layout and directory structure within `packages/agent` (`src/briefing/`, `src/client/`, `src/schemas/`, `src/citations/`).
- Specific prompt wording and template phrasing for Gemma 4 narration in `packages/agent/src/briefing/prompt.ts`.
- Exact HTTP status codes and response envelope format for query validation errors.

## Deferred Ideas

- None — all decisions stayed strictly within Phase 3 scope.
