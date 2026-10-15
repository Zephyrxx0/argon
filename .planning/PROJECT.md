# Argon

## What This Is

Argon is a project-memory agent that answers one fundamental question for any git repository: *"What must I know before I touch this?"* It analyzes target scopes (files, components, diffs, or natural language tasks) against a knowledge graph stored in FalkorDB to return an evidence-backed briefing covering blast radius, recent/expert owners, governing architectural decisions in force, and historical precedent. Every claim is strictly cited to a verified graph node.

## Core Value

Every briefing claim is mathematically grounded in and computed by the FalkorDB knowledge graph (traversals, PageRank/centrality, temporal predicates, and vector search) with 100% citation integrity—"no graph, no answer."

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **WS-01**: Guest-first workspaces supporting arbitrary git repositories without mandatory login.
- [ ] **ING-01**: Tier 0 ingestion extracting commits, authors, file touches, co-change coupling, and `REVERTS` relationships.
- [ ] **DEC-01**: Structured decision extraction from markdown ADRs/RFCs and commit messages with supersession windows (`valid_from`, `valid_to`).
- [ ] **EMB-01**: Embedding generation using EmbeddingGemma-2 (`q8`, 512-d) on Node.js CPU via Transformers.js with L2-normalized MRL truncation.
- [ ] **GRAPH-01**: FalkorDB graph schema, constraints, vector index, and 8 parameterized named queries executed exclusively via `GRAPH.RO_QUERY`.
- [ ] **JOB-01**: Pure FalkorDB `IngestJob` node state tracking and background worker polling without external queue dependencies.
- [ ] **GW-01**: Cloud Run read-only query gateway with Direct VPC egress to FalkorDB on Compute Engine (ports closed to public).
- [ ] **BRIEF-01**: Parallel query retrieval pipeline followed by single-call Gemma 4 narration with strict Zod schema validation and retry loop.
- [ ] **CITE-01**: Strict citation integrity post-check verifying all cited node IDs against FalkorDB before presenting to the user.
- [ ] **UI-01**: Command bar interface, brutalist evidence cards (2077 tweakcn theme), and Cytoscape.js traversal canvas (in-memory layout).
- [ ] **EVAL-01**: Historical revert backtest runner with `asOf` date rewinding and no-graph baseline comparison.

### Out of Scope

- **Custom AST/Symbol Code Parser**: Graphify or AST tools are optional inputs, not core product deliverables.
- **Mandatory GitHub App Login in MVP**: Private repo login deferred to post-hackathon to avoid Rule 6 ambiguities and setup friction.
- **Multi-Repo Cross-Organization Indexing**: Scoped strictly to single-repository workspaces.
- **External Redis/BullMQ Service**: FalkorDB itself acts as the single datastore and operational state store.
- **Multi-step unconstrained Cypher generation**: Replaced by 8 locked, parameterized named queries to ensure multi-hop reliability.

## Context

- Target Hackathon: Graph Hacks: Context for AI Agents (WeMakeDevs x FalkorDB), Oct 15–18, 2026.
- Primary Tracks: Track 1 (Agents That Act on Connected Data) and Track 3 (Company Brain). Track 2 is optional.
- Built on top of FalkorDB (Redis graph module with openCypher, graph algorithms, and vector indexing).
- Front-end hosted on Vercel (Next.js App Router, Tailwind CSS, shadcn/ui).
- Core LLM: Gemma 4 via Google AI Studio free tier.

## Constraints

- **Database**: FalkorDB as the primary and only database (no secondary Postgres/Firestore datastore).
- **Execution**: Computations (PageRank, shortest paths, CDLP, blast radius) must occur in Cypher/algorithms, not in client JavaScript.
- **Cost**: $0-$25 infrastructure budget; free LLM tiers, Cloud Run free tier, single GCP e2-medium VM.
- **Licensing/Rules**: Public, synthetic, or dogfooded data only in public demos.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| GD-01: Tier 0 Git & ADR-first extraction | Avoids schedule risk from noisy heuristic NLP on raw commits | — Pending |
| GD-02: Cloud Run Gateway + Direct VPC egress | Closes FalkorDB ports to public internet while keeping serverless frontend clean | — Pending |
| GD-03: EmbeddingGemma-2 512-d ONNX in worker | Open, lightweight, fits 512-d vector index one-way door constraint | — Pending |
| GD-04: Deterministic Zod validation on Gemma 4 | Guarantees structured output stability under free-tier endpoints | — Pending |
| GD-05: Preloaded showcase repos + synthetic graph | Guarantees deterministic zero-latency demo under live judging | — Pending |
| GD-06: Focus on Track 1 and Track 3 | Maximizes impact and prevents dilution across too many tracks | — Pending |
| GD-07: In-memory Cytoscape canvas state | Keeps DB schema clean and avoids client/server layout sync overhead | — Pending |
| GD-08: Guest mode first, defer GitHub App | Eliminates OAuth setup and Hackathon Rule 6 ambiguity | — Pending |
| GD-09: FalkorDB-native IngestJob polling | Eliminates BullMQ/extra Redis instances | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-15 after initialization*

