# Requirements: Argon

**Defined:** 2026-10-15  
**Core Value:** Every briefing claim is mathematically grounded in and computed by the FalkorDB knowledge graph (traversals, PageRank/centrality, temporal predicates, and vector search) with 100% citation integrity—"no graph, no answer."

## v1 Requirements

### Workspaces & Ingest Operations
- [ ] **WS-01**: User can input any public git repository URL or select a preloaded showcase repo without an account.
- [ ] **JOB-01**: Background worker tracks ingestion states (`pending`, `cloning`, `mining`, `indexing`, `completed`, `failed`) directly on `(:IngestJob)` graph nodes.
- [ ] **ING-01**: Worker performs shallow/blobless git clone and derives `File`, `Person`, `Commit`/`PullRequest`, and `TOUCHES` edges.
- [ ] **ING-02**: Worker computes co-change coupling to establish initial component boundaries and dependency edges.
- [ ] **ING-03**: Worker identifies git revert commits to create `(:PullRequest)-[:REVERTS]->(:PullRequest)` edges.

### Decision Mining & Vector Search
- [ ] **DEC-01**: Worker extracts architectural decisions from markdown ADRs/RFCs and commit messages into `(:Decision)` nodes.
- [ ] **DEC-02**: Worker links decisions to components via `[:GOVERNS]` and tracks supersession via `[:SUPERSEDES]`, managing `valid_from` and `valid_to` timestamps.
- [ ] **EMB-01**: Worker embeds decision titles and summaries using EmbeddingGemma-2 (`q8`, 512-d) via Transformers.js in Node.js CPU with Matryoshka truncation and L2 re-normalization.
- [ ] **VEC-01**: FalkorDB vector index is created and populated at exactly 512 dimensions for semantic decision and precedent retrieval.

### Graph Engine & Gateway
- [ ] **GRAPH-01**: FalkorDB graph schema and constraints are established in `.cypher` files.
- [ ] **GRAPH-02**: Eight parameterized named queries (`resolve_scope`, `blast_radius`, `risk_ranking`, `who_knows`, `constraining_decisions`, `precedent_search`, `path_between`, `component_overview`) run exclusively via `GRAPH.RO_QUERY`.
- [ ] **GW-01**: Cloud Run gateway service exposes authenticated endpoints for the 8 named queries and communicates with FalkorDB over Direct VPC egress.

### Briefing Agent & Citations
- [ ] **BRIEF-01**: Backend executes relevant named queries in parallel to gather evidence for a requested scope.
- [ ] **BRIEF-02**: Single-call Gemma 4 narration model synthesizes query results into a structured briefing JSON with strict Zod schema validation and auto-retry parser.
- [ ] **CITE-01**: Citation enforcement post-check verifies that 100% of cited node IDs exist in the active graph before rendering.
- [ ] **MEM-01**: Briefing outcomes are recorded back to the workspace graph as `(:Briefing)` nodes linked via `[:CITES]` and `[:ABOUT]`.

### User Interface & Evaluation
- [ ] **UI-01**: Next.js user interface with single command bar, contributor selector, and brutalist evidence cards styled with the 2077 tweakcn theme.
- [ ] **UI-02**: Cytoscape.js interactive graph canvas highlights traversal paths behind each cited claim using in-memory client layout.
- [ ] **UI-03**: Visible "no graph, no answer" failure state when FalkorDB is unreachable.
- [ ] **EVAL-01**: Backtest runner replays historical reverts using `asOf` date rewinding and compares decision recall@k against a no-graph baseline.

## v2 Requirements (Post-Hackathon)

### Authentication & Integration
- **AUTH-01**: GitHub App OAuth login for private repository access.
- **SYNC-01**: Webhook-based incremental graph updates on push/merge events.
- **MCP-01**: MCP server endpoint exposing Argon graph tools directly to Cursor and Claude Code.
- **AST-01**: Optional Graphify tree-sitter integration joining code symbol callgraphs to `File` nodes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom AST/Code parsing | Codebase ASTs are heavily commoditized; Argon's novel value is decisions, people, and time. |
| Mandatory User Authentication | Eliminates onboarding friction for hackathon judges and prevents Rule 6 private data disputes. |
| Organization-wide multi-repo graphs | High complexity, single-repository graph isolation provides cleaner guarantees. |
| Unconstrained text-to-Cypher | Hallucinates multi-hop traversals and introduces query injection risks. |
| BullMQ / Secondary Redis queues | Unnecessary dependency; FalkorDB nodes track job states natively. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRAPH-01 | Phase 1 | Pending |
| GRAPH-02 | Phase 1 | Pending |
| EMB-01 | Phase 1 | Pending |
| VEC-01 | Phase 1 | Pending |
| JOB-01 | Phase 2 | Pending |
| ING-01 | Phase 2 | Pending |
| ING-02 | Phase 2 | Pending |
| ING-03 | Phase 2 | Pending |
| DEC-01 | Phase 2 | Pending |
| DEC-02 | Phase 2 | Pending |
| GW-01 | Phase 3 | Pending |
| BRIEF-01 | Phase 3 | Pending |
| BRIEF-02 | Phase 3 | Pending |
| CITE-01 | Phase 3 | Pending |
| MEM-01 | Phase 3 | Pending |
| WS-01 | Phase 4 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| EVAL-01 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-15*

