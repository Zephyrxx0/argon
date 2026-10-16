---
phase: 07-authenticated-ingestion-private-repo-selector
plan: "02"
subsystem: gateway-ingest
tags: [github-app, octokit, ttl-cache, dual-verification, identity-linking, opencypher, falkordb]

# Dependency graph
requires:
  - plan: 07-01
    provides: Secret-scrubbed git transport and redaction pipeline
  - phase: 06-authentication-multi-tenant-authorization
    provides: HS256 JWT auth, FalkorDB (:User) accounts, and tenant access queries
provides:
  - GitHubAppService with in-memory TTL token caching and Octokit integration
  - GET /api/v1/github/repositories authorized repository discovery endpoint
  - POST /api/v1/github/ingest and POST /api/v1/workspaces/ingest dual-verification ingestion endpoints
  - Multi-factor openCypher identity linking (`(:User)-[:IDENTIFIES]->(:Person)`)
affects: [07-03, gateway, ingest, web]

actuals:
  tokens: 4100
  tasks: 3
  commits: 1

tech-stack:
  added: ["@octokit/auth-app@^8.3.1", "@octokit/rest@^22.0.1"]
  patterns: [in-memory TTL token caching with 5-minute safety buffer, dual-authorization verification gate, multi-factor openCypher identity linking]

key-files:
  created:
    - apps/gateway/src/services/github-app.ts
    - apps/gateway/src/routes/github.ts
    - apps/gateway/test/services/github-app.test.ts
    - apps/gateway/test/routes/github-repos.test.ts
    - packages/ingest/test/writer/identity-linking.test.ts
  modified:
    - apps/gateway/package.json
    - apps/gateway/src/app.ts
    - packages/ingest/src/writer/queries.ts
    - packages/ingest/src/writer/falkordb.ts
    - packages/ingest/src/pipeline.ts
    - pnpm-lock.yaml

key-decisions:
  - "Constructed GitHubAppService with in-memory Map<number, CachedToken> cache using a 5-minute safety buffer before token expiration to prevent rate limiting (D-02)"
  - "Enforced dual verification check in POST /ingest ensuring user is authorized for the installation before minting installation tokens (D-04, T-07-04)"
  - "Linked User accounts to mined Person records via explicit (:User)-[:IDENTIFIES]->(:Person) edges without mutating immutable git topology (D-13)"
  - "Implemented multi-factor identity matching supporting verified emails, SHA-256 hashed emails, noreply formats, and case-insensitive login names (D-14)"

patterns-established:
  - "Dual verification gate: Authenticated routes must verify installation ownership before minting tokens"
  - "Non-mutating identity binding: User identities bind to graph nodes via relationships instead of modifying mined Git author properties"

requirements-completed:
  - ING-04
  - TENANT-02

---

# Plan 07-02 Summary: GitHub App Service & User Identity Linking

## What Was Done
1. **GitHub App Service with TTL Token Cache (`apps/gateway/src/services/github-app.ts`)**:
   - Installed `@octokit/auth-app` and `@octokit/rest`.
   - Implemented `GitHubAppService` with `getInstallationToken` (caching tokens in memory with a 5-minute pre-expiry safety margin), `getUserInstallations`, and `getInstallationRepositories` (normalizing repository metadata with owner avatars, private badge, default branch).
   - Implemented `verifyUserInstallation` enforcing dual-authorization checks against tenant spoofing (T-07-04).

2. **Repository Listing & Ingestion Endpoints (`apps/gateway/src/routes/github.ts`, `app.ts`)**:
   - Implemented `GET /api/v1/github/repositories` requiring non-anonymous JWT authentication, returning repository items across authorized installations.
   - Implemented `POST /api/v1/github/ingest` (and `/api/v1/workspaces/ingest`) verifying caller installation access, minting in-memory installation tokens, provisioning FalkorDB workspace ownership via `setUserWorkspaceAccess`, and dispatching ingestion.
   - Mounted routes cleanly in `createGatewayApp`.

3. **openCypher Author-to-User Identity Linking (`packages/ingest/src/writer/queries.ts`, `falkordb.ts`, `pipeline.ts`)**:
   - Added `LINK_USER_TO_PERSONS_QUERY` and `GET_LINKED_CONTRIBUTORS_QUERY`.
   - Multi-factor matching on verified emails, SHA-256 email hashes (protecting privacy), GitHub noreply emails (`<login>@users.noreply.github.com` and `<id>+<login>@users.noreply.github.com`), and case-insensitive login names.
   - Added `linkUserToMinedPersons` function in `falkordb.ts` and wired into pipeline stage 8d.

## Verification
- Unit & route tests:
  - `apps/gateway/test/services/github-app.test.ts`: 4/4 passed.
  - `apps/gateway/test/routes/github-repos.test.ts`: 7/7 passed.
  - `packages/ingest/test/writer/identity-linking.test.ts`: 3/3 passed.
- Full suite runs:
  - `@argon/gateway`: 7 test files, 43 passed (100%).
  - `@argon/ingest`: 8 test files, 35 passed, 1 skipped (100%).
