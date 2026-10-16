# Roadmap: Argon

**Milestone:** v2.0 GitHub App Integration & Incremental Sync  
**Core Value:** Every briefing claim is mathematically grounded in and computed by the FalkorDB knowledge graph (traversals, PageRank/centrality, temporal predicates, and vector search) with 100% citation integrity—"no graph, no answer."

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-10-16) — [.planning/milestones/v1.0-ROADMAP.md](file:///home/zeph/Code/argon/.planning/milestones/v1.0-ROADMAP.md)
- 🟡 **v2.0 GitHub App Integration & Incremental Sync** — Phases 6-8 (in planning)

## Phase Overview

```
Phase 6: Authentication & Multi-Tenant Authorization (AUTH-01, AUTH-02, TENANT-01)
  └── Phase 7: Authenticated Ingestion & Private Repo Selector (TENANT-02, ING-04, ING-05)
        └── Phase 8: Webhook Receiver & Incremental Sync Engine (SYNC-01, SYNC-02, SYNC-03)
```

## Phases

- [x] **Phase 6: Authentication & Multi-Tenant Authorization** — Better Auth GitHub OAuth integration with anonymous guest plugin, stateless cookie sessions, and FalkorDB graph multi-tenancy. (completed 2026-10-16)
- [x] **Phase 7: Authenticated Ingestion & Private Repo Selector** — GitHub App installation token generation, secret-scrubbed shallow cloning, and private repository selector. (completed 2026-10-16)
- [ ] **Phase 8: Webhook Receiver & Incremental Sync Engine** — HMAC-verified webhook handler, incremental commit/touch updates, ADR temporal validity advancement, and live sync pulse.

---

## Phase Details

### Phase 6: Authentication & Multi-Tenant Authorization

**Goal**: Implement GitHub OAuth authentication via Better Auth in `apps/web` with guest-safe stateless cookie sessions and the `anonymous()` plugin, extend FalkorDB openCypher schema with `:User` / `[:ACCESSES]` nodes, and enforce tenant authorization gates in `apps/gateway`.
**Depends on**: v1.0 foundation (Phases 1-5)
**Requirements**: AUTH-01, AUTH-02, TENANT-01
**Success Criteria** (what must be TRUE):

  1. User can sign in with GitHub via Better Auth and view their user avatar, name, and sign-out controls in `HeaderBar`, with session persisting across browser refreshes.
  2. Unauthenticated visitors can browse public showcase workspaces and run graph queries via Better Auth's `anonymous()` plugin without forced login prompts or redirect loops.
  3. FalkorDB schema enforces `(:User)-[:ACCESSES]->(:Workspace)` constraints and gateway rejects unauthorized query access to private workspaces with `403 Forbidden`.

**Plans**: 3 plans (completed 2026-10-16)

---

### Phase 7: Authenticated Ingestion & Private Repo Selector

**Goal**: Implement short-lived GitHub App installation token generation, authenticated shallow git clone with strict secret redaction, and a searchable repository picker dialog in `apps/web`.
**Depends on**: Phase 6
**Requirements**: TENANT-02, ING-04, ING-05
**Success Criteria** (what must be TRUE):

  1. Authenticated user can view and search their authorized GitHub repositories in a modal dialog instead of manually typing clone URLs.
  2. Ingestion engine successfully clones a private repository using short-lived installation tokens without writing tokens to logs, stdout/stderr, or `(:IngestJob.error)`.
  3. Mined commits link commit author identities to graph `(:Person)` nodes matching authenticated user profiles.

**Plans**: 3 plans (completed 2026-10-16)

---

### Phase 8: Webhook Receiver & Incremental Sync Engine

**Goal**: Implement HMAC-verified GitHub webhook listener in `apps/gateway`, incremental commit/touch/coupling updates, ADR temporal validity window advancement, and Cytoscape canvas live sync feedback.
**Depends on**: Phase 7
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):

  1. Gateway verifies `X-Hub-Signature-256` HMAC signatures using timing-safe comparison, rejecting invalid signatures with `401 Unauthorized`.
  2. On `push` event, graph updates modified files, author touches, and co-change coupling without triggering a full repository re-clone.
  3. On merged pull request with ADR modifications, system advances `valid_to` timestamps on superseded decisions and triggers a visual live pulse on the Cytoscape canvas.

**Plans**: 3 plans (TBD during Phase 8 planning)

---

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-10-16</summary>

- [x] Phase 1: Database Schema & Vector Foundation (4/4 plans) — completed 2026-10-15
- [x] Phase 2: Ingestion Pipeline & Decision Mining (4/4 plans) — completed 2026-10-15
- [x] Phase 3: Query Gateway & Briefing Pipeline (4/4 plans) — completed 2026-10-15
- [x] Phase 4: Next.js Frontend & Graph Canvas (4/4 plans) — completed 2026-10-15
- [x] Phase 5: Revert Backtest & Showcase Corpus (4/4 plans) — completed 2026-10-16

</details>
