# Project Research Summary

**Project:** Argon  
**Domain:** Authenticated Git Graph Knowledge Base & Webhook Ingestion  
**Researched:** 2026-10-16  
**Confidence:** HIGH  

## Executive Summary

Argon Milestone v2.0 transitions the platform from a guest-first showcase explorer into an authenticated, production-grade project memory system. The core architectural challenge is introducing **GitHub App authentication, multi-tenant workspace isolation, and webhook-driven incremental graph updates** while strictly preserving two non-negotiable project constraints:
1. **FalkorDB as the sole primary datastore** (no secondary PostgreSQL/MongoDB/Firestore database).
2. **First-class Guest mode preservation** (Hackathon judges and public visitors must continue exploring showcase graphs and public repositories without forced login).

Our research evaluated multiple auth libraries and session architectures against these constraints. **NextAuth v5 (Auth.js beta)** in stateless JWT mode (`strategy: "jwt"`) was selected as the optimal solution. Unlike Better Auth (which requires an SQL/Mongo database adapter), NextAuth v5 operates entirely in-memory and via secure HTTP-only cookies without requiring any RDBMS adapter, perfectly honoring the FalkorDB-only constraint. Furthermore, we adopt a **Dual-Mode session model**: unauthenticated requests are treated as valid Guests with access to public showcase workspaces, while authenticated users receive GitHub App installation tokens to access private repositories.

For ingestion and synchronization, short-lived (1-hour) installation access tokens (`ghs_...`) generated via `@octokit/auth-app` allow ephemeral git cloning with zero credential persistence. A dedicated regex sanitization layer ensures tokens are never leaked to logs or error properties. Finally, a new webhook receiver in `apps/gateway` verifies GitHub HMAC-SHA256 signatures and applies incremental commit and ADR validity updates directly to FalkorDB without costly full re-clones.

## Key Findings

### Recommended Stack

- **`next-auth@beta` (`^5.0.0-beta.25`)**: Configured with GitHub Provider and stateless JWT sessions. No database adapter required.
- **`@octokit/auth-app` & `@octokit/rest`**: Handles GitHub App RS256 JWT signing to mint 1-hour ephemeral installation tokens for private repository cloning.
- **Node.js `crypto` (`timingSafeEqual`)**: Timing-attack resistant verification of `X-Hub-Signature-256` webhook headers.
- **FalkorDB openCypher**: Natively represents multi-tenant access via `(:User)-[:ACCESSES]->(:Workspace)` edges.

### Expected Features

**Must have (table stakes):**
- **GitHub App OAuth & Session (AUTH-01):** HeaderBar sign-in/sign-out, user profile avatar popover, and HTTP-only JWT cookies.
- **Guest-First Experience:** Unauthenticated visitors remain first-class citizens, exploring showcase workspaces and running briefings without login.
- **Multi-Tenant Graph Authorization (AUTH-02):** Gateway security gate enforcing `[:ACCESSES]` verification before executing named queries on private workspaces.
- **Private Repo Ingestion & Token Redaction (ING-04):** Authenticated shallow git clones with automatic secret stripping from logs and error properties; searchable repository selector.
- **Webhook Incremental Sync (SYNC-01):** HMAC-verified `push` and merged PR processing updating files, touches, coupling, and decision validity.

**Should have (competitive differentiators):**
- Automatic linking of authenticated GitHub profiles to mined `(:Person)` graph nodes.
- Cytoscape live visual pulse when incremental sync completes.

### Architecture Approach

1. **`apps/web`**: Hosts NextAuth v5 handlers, session context provider, and the repository selector dialog.
2. **`apps/gateway`**: Hosts the HMAC-verified webhook endpoint (`POST /api/v1/webhooks/github`) and acts as the tenant security gate before routing queries to FalkorDB.
3. **`packages/graph`**: Houses multi-tenant schema constraints and new parameterized openCypher queries (`check_workspace_access`, `link_user_workspace`, `incremental_push_update`, `advance_adr_validity`).
4. **`packages/ingest`**: Implements token minting and secret-scrubbed shallow cloning.

### Critical Pitfalls

1. **Auth Middleware Over-reach:** Blanket Next.js redirects that block unauthenticated guests. *Mitigation: Allow null sessions as guest access; guard only private actions.*
2. **Git Token Leakage:** Git CLI echoing `https://x-access-token:...` to stderr on failure. *Mitigation: Mandatory regex redaction in all git subprocess wrappers.*
3. **Webhook Timing Attacks:** Insecure signature comparison. *Mitigation: Use `crypto.timingSafeEqual`.*
4. **Branch Drift on Incremental Sync:** Out-of-order webhooks or force-pushes desyncing commit chains. *Mitigation: Verify `before` commit existence; trigger background shallow re-sync if diverged.*

## Implications for Roadmap

The recommended 3-phase execution structure for Milestone v2.0:
1. **Phase 06: Authentication & Multi-Tenant Authorization (`AUTH-01`, `AUTH-02`)**:
   - Establish NextAuth v5 in `apps/web` with guest-safe configuration.
   - Extend FalkorDB schema with `:User`, `:Organization`, and `[:ACCESSES]`.
   - Add gateway tenant authorization middleware.
2. **Phase 07: Authenticated Ingestion & Private Repo Selector (`ING-04`)**:
   - Implement Octokit GitHub App installation token generation.
   - Implement secret-redacting git clone in `packages/ingest`.
   - Build repository picker component in `apps/web`.
3. **Phase 08: Webhook Receiver & Incremental Sync Engine (`SYNC-01`)**:
   - Build HMAC-verified webhook endpoint in `apps/gateway`.
   - Implement incremental commit/touch updater and ADR supersession window advancer in FalkorDB.
   - Add frontend sync feedback / canvas pulse.

## Sources

- [NextAuth.js v5 Documentation (Auth.js)](https://authjs.dev)
- [Next.js 15 App Router Authentication Guide](https://nextjs.org/docs/app/building-your-application/authentication)
- [GitHub App Authentication & Installation Tokens API](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)
- [GitHub Webhooks & Securing Webhooks with HMAC](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [FalkorDB openCypher Query & Constraints Reference](https://docs.falkordb.com)

