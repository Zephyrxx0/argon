# Requirements: Argon Milestone v2.0

**Defined:** 2026-10-16  
**Core Value:** Every briefing claim is mathematically grounded in and computed by the FalkorDB knowledge graph (traversals, PageRank/centrality, temporal predicates, and vector search) with 100% citation integrity—"no graph, no answer."  

## Milestone v2.0 Requirements

Requirements for Milestone v2.0 release. Each maps to roadmap phases.

### Authentication & Identity

- [ ] **AUTH-01**: User can authenticate via GitHub App OAuth using NextAuth v5 in `apps/web` with secure HTTP-only JWT sessions and view their profile in HeaderBar.
- [ ] **AUTH-02**: Unauthenticated guests can seamlessly browse public showcase workspaces and run graph queries without forced login or redirect loops.

### Multi-Tenant Graph Authorization

- [ ] **TENANT-01**: User can have their workspace access securely isolated in FalkorDB via `(:User)-[:ACCESSES]->(:Workspace)` edges, verified by the gateway before executing named queries.
- [ ] **TENANT-02**: User can link their authenticated GitHub identity to mined `(:Person)` graph nodes in the repository commit graph.

### Authenticated Ingestion & Secret Redaction

- [ ] **ING-04**: User can select repositories from their authorized GitHub App installations via a searchable dropdown and trigger authenticated shallow git clones using short-lived installation tokens.
- [ ] **ING-05**: System redacts all installation tokens and credentials from git stdout/stderr, logs, and FalkorDB `(:IngestJob)` error properties.

### Webhook & Incremental Graph Sync

- [ ] **SYNC-01**: Gateway can receive and verify GitHub webhook payloads (`push`, `pull_request`) using timing-safe HMAC-SHA256 signature verification.
- [ ] **SYNC-02**: System incrementally updates `(:Commit)`, `(:File)`, and `[:TOUCHES]` nodes on push events without performing a full repository re-clone.
- [ ] **SYNC-03**: System detects merged pull requests, updates `(:Decision)` supersession validity windows (`valid_to`), and triggers a live visual sync pulse on the Cytoscape canvas.

## Future Requirements (v3.0)

- **ORG-01**: Multi-user organization team spaces with role-based access control (Admin, Member, Viewer).
- **CROSS-01**: Cross-repository multi-graph dependency and shared library impact analysis.
- **SLACK-01**: Slack bot integration triggering Argon briefings directly from PR comments.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Secondary SQL / Mongo Database | FalkorDB is the primary and only database. NextAuth operates purely stateless with JWT sessions. |
| Username / Password Authentication | Argon is a developer tool tied directly to GitHub git repositories; GitHub App OAuth is the only relevant auth method. |
| Deep AST / Symbol-level Code Parsers | Tier 0 git topology (commits, authors, files, coupling) and ADR decision mining provide maximum signal-to-noise without heavy AST maintenance overhead. |
| Unconstrained openCypher LLM Generation | Replaced by parameterized named queries to ensure multi-hop traversal reliability and zero hallucinated schema calls. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 06 | Pending |
| AUTH-02 | Phase 06 | Pending |
| TENANT-01 | Phase 06 | Pending |
| TENANT-02 | Phase 07 | Pending |
| ING-04 | Phase 07 | Pending |
| ING-05 | Phase 07 | Pending |
| SYNC-01 | Phase 08 | Pending |
| SYNC-02 | Phase 08 | Pending |
| SYNC-03 | Phase 08 | Pending |

