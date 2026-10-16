# Argon

## What This Is

Argon is a project-memory agent that answers one fundamental question for any git repository: *"What must I know before I touch this?"* It analyzes target scopes (files, components, diffs, or natural language tasks) against a knowledge graph stored in FalkorDB to return an evidence-backed briefing covering blast radius, recent/expert owners, governing architectural decisions in force, and historical precedent. Every claim is strictly cited to a verified graph node.

## Core Value

Every briefing claim is mathematically grounded in and computed by the FalkorDB knowledge graph (traversals, PageRank/centrality, temporal predicates, and vector search) with 100% citation integrity—"no graph, no answer."

## Milestone History

- ✅ **v1.0 MVP** — Shipped 2026-10-16 (Phases 1-5: Schema, Embeddings, Ingestion, Gateway, Cytoscape Canvas, Revert Backtest)
- ✅ **v2.0 GitHub App Integration & Incremental Sync** — Shipped 2026-10-16 (Phases 6-8: Authentication, Multi-Tenancy, Secret Redaction, Webhooks, Incremental Sync, SSE)

## Current Milestone: Preparing v3.0

**Goal:** Multi-repo cross-indexing, organization team spaces with RBAC, and pull request bot integration.

## Requirements

### Validated

- [x] **GRAPH-01**: FalkorDB graph schema, constraints, vector index, and 8 parameterized named queries executed exclusively via `GRAPH.RO_QUERY`. — *Phase 01*
- [x] **EMB-01**: Embedding generation using EmbeddingGemma-2 (`q8`, 512-d) on Node.js CPU via Transformers.js with L2-normalized MRL truncation. — *Phase 01*
- [x] **ING-01**: Tier 0 ingestion extracting commits, authors, file touches, co-change coupling, and `REVERTS` relationships. — *Phase 02*
- [x] **DEC-01**: Structured decision extraction from markdown ADRs/RFCs and commit messages with supersession windows (`valid_from`, `valid_to`). — *Phase 02*
- [x] **JOB-01**: Pure FalkorDB `IngestJob` node state tracking and background worker polling without external queue dependencies. — *Phase 02*
- [x] **GW-01**: Cloud Run read-only query gateway with Direct VPC egress to FalkorDB on Compute Engine (ports closed to public). — *Phase 03*
- [x] **BRIEF-01**: Parallel query retrieval pipeline followed by single-call Gemma 4 narration with strict Zod schema validation and retry loop. — *Phase 03*
- [x] **CITE-01**: Strict citation integrity post-check verifying all cited node IDs against FalkorDB before presenting to the user. — *Phase 03*
- [x] **WS-01**: Guest-first workspaces supporting arbitrary git repositories without mandatory login. — *Phase 04*
- [x] **UI-01**: Command bar interface, brutalist evidence cards (2077 tweakcn theme), and Cytoscape.js traversal canvas (in-memory layout). — *Phase 04*
- [x] **EVAL-01**: Historical revert backtest runner with `asOf` date rewinding and no-graph baseline comparison. — *Phase 05*
- [x] **AUTH-01**: User can authenticate via GitHub OAuth using Better Auth in `apps/web` with stateless encrypted session cookies and view profile in HeaderBar. — *Phase 06*
- [x] **AUTH-02**: Unauthenticated guests can seamlessly browse public showcase workspaces and run graph queries using Better Auth's `anonymous()` plugin without forced login. — *Phase 06*
- [x] **TENANT-01**: User workspace access securely isolated in FalkorDB via `(:User)-[:ACCESSES]->(:Workspace)` edges, verified by gateway before query execution. — *Phase 06*
- [x] **TENANT-02**: User can link their authenticated GitHub identity to mined `(:Person)` graph nodes in the repository commit graph. — *Phase 07*
- [x] **ING-04**: User can select repositories from authorized GitHub App installations via searchable dropdown and trigger authenticated shallow clones with installation tokens. — *Phase 07*
- [x] **ING-05**: System redacts all installation tokens and credentials from git stdout/stderr, logs, and FalkorDB `(:IngestJob)` error properties. — *Phase 07*
- [x] **SYNC-01**: Gateway receives and verifies GitHub webhook payloads (`push`, `pull_request`) using timing-safe HMAC-SHA256 signature verification. — *Phase 08*
- [x] **SYNC-02**: System incrementally updates `(:Commit)`, `(:File)`, and `[:TOUCHES]` nodes on push events without performing a full repository re-clone. — *Phase 08*
- [x] **SYNC-03**: System detects merged PRs, updates `(:Decision)` supersession validity windows (`valid_to`), and triggers live visual sync pulse on Cytoscape canvas. — *Phase 08*

### Active

- [ ] **ORG-01**: Multi-user organization team spaces with role-based access control (Admin, Member, Viewer).
- [ ] **CROSS-01**: Cross-repository multi-graph dependency and shared library impact analysis.
- [ ] **SLACK-01**: Slack bot integration triggering Argon briefings directly from PR comments.

### Out of Scope

- **Custom AST/Symbol Code Parser**: Graphify or AST tools are optional inputs, not core product deliverables.
- **External Redis/BullMQ Service**: FalkorDB itself acts as the single datastore and operational state store.
- **Multi-step unconstrained Cypher generation**: Replaced by parameterized named queries to ensure multi-hop traversal reliability.
- **Username / Password Authentication**: Argon is developer-focused and tied directly to GitHub accounts.

## Context

- Target Hackathon: Graph Hacks: Context for AI Agents (WeMakeDevs x FalkorDB), Oct 15–18, 2026.
- Primary Tracks: Track 1 (Agents That Act on Connected Data) and Track 3 (Company Brain).
- Built on top of FalkorDB (Redis graph module with openCypher, graph algorithms, and 512-d vector indexing).
- Front-end hosted on Vercel (Next.js 15 App Router, Tailwind CSS v4, shadcn/ui, Cytoscape.js).
- Core LLM: Gemma 4 via Google AI Studio free tier.
- Shipped v1.0 MVP (5 phases, 20 plans, 106 automated tests) and v2.0 (3 phases, 9 plans, 273 automated tests).
- Monorepo structure: 9 pnpm packages/apps (`apps/web`, `apps/gateway`, `packages/graph`, `packages/ingest`, `packages/briefing`, `packages/eval`, `packages/shared`, `packages/tsconfig`, `packages/corpus`).

## Constraints

- **Database**: FalkorDB as the primary and only database (no secondary Postgres/Firestore datastore).
- **Execution**: Computations (PageRank, shortest paths, CDLP, blast radius) must occur in Cypher/algorithms, not in client JavaScript.
- **Cost**: $0-$25 infrastructure budget; free LLM tiers, Cloud Run free tier, single GCP e2-medium VM.
- **Licensing/Rules**: Public, synthetic, or dogfooded data only in public demos.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| GD-01: Tier 0 Git & ADR-first extraction | Avoids schedule risk from noisy heuristic NLP on raw commits | ✓ Good — 100% stable ADR/RFC parsing and temporal validity |
| GD-02: Cloud Run Gateway + Direct VPC egress | Closes FalkorDB ports to public internet while keeping serverless frontend clean | ✓ Good — Hono gateway enforces fail-closed token auth |
| GD-03: EmbeddingGemma-2 512-d ONNX in worker | Open, lightweight, fits 512-d vector index one-way door constraint | ✓ Good — Matryoshka L2 normalized CPU embedding in ~100ms |
| GD-04: Deterministic Zod validation on Gemma 4 | Guarantees structured output stability under free-tier endpoints | ✓ Good — 1-step auto-repair loop prevents malformed JSON |
| GD-05: Preloaded showcase repos + synthetic graph | Guarantees deterministic zero-latency demo under live judging | ✓ Good — 3 showcase corpora seeded in <5s via Cypher UNWIND |
| GD-06: Focus on Track 1 and Track 3 | Maximizes impact and prevents dilution across too many tracks | ✓ Good — Tailored briefing pipeline and memory write-back |
| GD-07: In-memory Cytoscape canvas state | Keeps DB schema clean and avoids client/server layout sync overhead | ✓ Good — 60fps client fCoSE physics layout with bidirectional focus |
| GD-08: Guest mode first, defer GitHub App | Eliminates OAuth setup and Hackathon Rule 6 ambiguity | ✓ Good — Instant zero-friction demo judging |
| GD-09: FalkorDB-native IngestJob polling | Eliminates BullMQ/extra Redis instances | ✓ Good — Atomic state progression without extra infrastructure |
| GD-10: Better Auth + Anonymous Plugin | Anonymous guest session auto-minting + HS256 JWT cookie issuance for seamless zero-friction showcase viewing | ✓ Good — Frictionless onboarding with clean upgrade path |
| GD-11: Short-Lived Installation Tokens with Stream Redaction | Git transport via `-c http.extraheader` with regex redaction across all process buffers and FalkorDB error properties | ✓ Good — Zero token leakage in logs or database |
| GD-12: Timing-Safe HMAC Webhook Verification with LRU Dedup | Protects against webhook replay/tampering while 10,000 LRU delivery deduplicator guarantees exactly-once processing | ✓ Good — Timing attack immune and replay safe |
| GD-13: Parameterized openCypher Incremental Sync & ADR Supersession | Direct graph mutations avoid full repo clones; advances `valid_to` timestamps on superseded decisions | ✓ Good — Fast sub-second updates without re-cloning |
| GD-14: Workspace-Scoped Server-Sent Events (SSE) Streaming | Push real-time graph mutations to web clients with Cytoscape neon pulse animation and stale briefing alerts | ✓ Good — Instant visual feedback with auto-reconnect |

---
*Last updated: 2026-10-16 after v2.0 milestone*
