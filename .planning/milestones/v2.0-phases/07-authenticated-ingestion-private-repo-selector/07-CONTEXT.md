# Phase 7: Authenticated Ingestion & Private Repo Selector - Context

**Gathered:** 2026-10-16  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Phase 7 implements authenticated private repository ingestion and repository selection in Argon. This encompasses:
1. Backend GitHub App installation token generation with TTL caching in `apps/gateway`.
2. Secure shallow git cloning via `packages/ingest` with `http.extraheader` authentication and strict regex secret sanitization across all stdout/stderr streams, logs, and FalkorDB `(:IngestJob)` error properties (TENANT-02, ING-04, ING-05).
3. A searchable repository picker dialog integrated into `apps/web`'s `IngestModal` querying authorized GitHub App installations.
4. Linking authenticated `(:User)` identities to mined `(:Person)` graph nodes via explicit `[:IDENTIFIES]` edges in FalkorDB.

</domain>

<decisions>
## Implementation Decisions

### 1. GitHub App Token Minting & Lifecycle
- **D-01:** `apps/gateway` service holds the GitHub App Private Key and mints short-lived installation access tokens on demand using `@octokit/auth-app`, keeping GitHub App secrets isolated within the backend service boundary and out of web client bundles. — **Reversibility:** costly — Defines security architecture boundary and Octokit client wiring.
- **D-02:** Installation tokens are cached in-memory in Gateway using a TTL cache keyed by `installationId` with a 5-minute pre-expiry safety buffer (up to 55 minutes validity), preventing redundant token minting roundtrips. — **Reversibility:** reversible — Gateway memory cache configuration.
- **D-03:** `packages/ingest` receives installation tokens in-memory via `CloneOptions` / `IngestConfig` (`installationToken?: string`) passed directly by callers; tokens are never accepted or exposed via CLI flags, environment variables, or disk files. — **Reversibility:** costly — Modifies pipeline and clone function signatures.
- **D-04:** Dual authorization verification: Gateway checks that the authenticated user (`userId` / GitHub identity) is an authorized member/collaborator of the GitHub App installation before granting repository clone tokens. — **Reversibility:** costly — Gateway multi-tenant authorization middleware logic.

### 2. Secret Scrubbing & Git URL Redaction
- **D-05:** Git authentication uses `http.extraheader` injection: Pass `Authorization: basic <base64(x-access-token:TOKEN)>` via git configuration arguments (`-c http.extraheader=...`), keeping remote URLs clean (`https://github.com/org/repo`) on disk, in `.git/config`, and in `git remote -v`. — **Reversibility:** one-way — Core git clone transport implementation across `packages/ingest`.
- **D-06:** Centralized `redactSecrets` utility in `packages/ingest` with strict GitHub token regexes (`ghs_[A-Za-z0-9_]+`, `ghp_[A-Za-z0-9_]+`, `Bearer [A-Za-z0-9_.-]+`, `x-access-token:[^@]+@`) applied systematically across all loggers, thrown error objects, and FalkorDB `(:IngestJob.error)` properties. — **Reversibility:** costly — Applied across all ingestion logging and error reporting boundaries.
- **D-07:** Authentication failures (401/403 from GitHub) return structured sanitized error codes (`AUTH_FAILED_EXPIRED_OR_REVOKED`) with clear remediation guidance, preventing raw subprocess stack traces or leaked request headers from reaching users or logs. — **Reversibility:** reversible — Ingest pipeline error taxonomy.
- **D-08:** Rigorous canary secret leak tests in Vitest: Integration tests inject synthetic canary tokens (`ghs_canary_secret_xyz`) into simulated clone errors and stdout/stderr streams, asserting zero leakage across all error strings, logs, and database records. — **Reversibility:** reversible — Test suite assertion contract.

### 3. Private Repo Picker UI & IngestModal UX
- **D-09:** `IngestModal` features a tabbed interface with 'Your Repositories' tab (for authenticated users, fetching authorized repos from GitHub App installations with Lock/Globe badges) and 'Public URL' tab (direct HTTPS URL for open source showcases). — **Reversibility:** reversible — UI tab layout in `apps/web/components/workspace/ingest-modal.tsx`.
- **D-10:** Repository items render as rich rows displaying `owner/repo`, Private/Public badge (with Lock/Globe icons), default branch badge (`main`/`master`), and organization avatar. — **Reversibility:** reversible — UI component styling.
- **D-11:** Client-side fuzzy search and organization filter pills enable instant latency-free filtering over authorized repositories as the user types. — **Reversibility:** reversible — Frontend state filtering logic.
- **D-12:** Contextual empty states: Unauthenticated guests are prompted to 'Sign In with GitHub' (opening AuthModal), while users with 0 installations see an 'Install Argon GitHub App' link to `https://github.com/apps/<app-slug>/installations/new` with a 'Check Again' refresh button. — **Reversibility:** reversible — UX state machine.

### 4. Author-to-User Identity Linking (TENANT-02)
- **D-13:** Identity relationship in FalkorDB is modeled as an explicit `(:User)-[:IDENTIFIES]->(:Person)` edge, preserving immutable mined git topology while cleanly binding authenticated app accounts to repository contributors. — **Reversibility:** one-way — openCypher graph schema contract.
- **D-14:** Multi-factor identity matching: Links are formed by matching GitHub user primary/verified emails, GitHub noreply email patterns (`<id>+<login>@users.noreply.github.com` and `<login>@users.noreply.github.com`), or exact case-insensitive login/name match. — **Reversibility:** costly — Graph writer identity matching queries.
- **D-15:** Dual lifecycle trigger: Identity linking executes automatically at the conclusion of a repository ingestion run AND whenever a user signs in to link existing historical graph nodes. — **Reversibility:** costly — Auth hook and ingestion pipeline orchestration.
- **D-16:** Visual verification pills: In `NodeInspector` and `ContributorPicker`, linked identities display verified GitHub profile avatars, links to `github.com/<login>`, and a distinctive 'You' badge for the active authenticated user. — **Reversibility:** reversible — Component rendering enhancements.

### the agent's Discretion
- Exact debounce timing for client-side search filtering (default 150ms).
- Fallback placeholder icons when GitHub organization avatars fail to load.
- Specific Cypher transaction batching for linking `(:User)-[:IDENTIFIES]->(:Person)`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture & Requirements
- `.planning/PROJECT.md` — Project memory core values, architecture constraints, and tech stack guidelines.
- `.planning/REQUIREMENTS.md` — Requirements TENANT-02, ING-04, and ING-05.
- `.planning/ROADMAP.md` §Phase 7 — Scope, goal, and success criteria for Phase 7.
- `.planning/v2.0-MILESTONE-SPEC.md` §2 & §3 — Milestone v2.0 specification for authenticated ingestion and token redaction.
- `.planning/phases/06-authentication-multi-tenant-authorization/06-CONTEXT.md` — Phase 6 context establishing Better Auth, JWT transport, and FalkorDB `:User` / `[:ACCESSES]` schema.

### Codebase Implementations
- `packages/ingest/src/git/clone.ts` — Existing git clone logic using simple-git.
- `packages/ingest/src/git/author.ts` — Author identity extraction from git commit logs.
- `packages/ingest/src/writer/falkordb.ts` — Ingestion graph writer for FalkorDB nodes and relationships.
- `apps/web/components/workspace/ingest-modal.tsx` — Ingestion modal dialog to be upgraded with repository picker.
- `apps/web/components/contributor/contributor-picker.tsx` — Contributor picker component for displaying linked contributor identities.
- `apps/web/components/canvas/node-inspector.tsx` — Node inspection panel for displaying person details and verification badges.
- `apps/gateway/src/middleware/tenant-auth.ts` — Gateway tenant authorization middleware.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/ingest/src/git/clone.ts`: `cloneRepository()` currently handles blobless shallow clones; readily adaptable for `http.extraheader` auth injection.
- `apps/web/components/workspace/ingest-modal.tsx`: Existing modal dialog with multi-step progress UI (`CLONING`, `DERIVING`, `EMBEDDING`, `READY`).
- `apps/web/components/auth/user-button.tsx`: Existing authenticated user profile trigger and session state consumer.
- `packages/graph/src/schema/schema.cypher`: Schema file defining node constraints and labels.

### Established Patterns
- Monospace dark cyberpunk aesthetic (`font-mono`, `bg-card/95`, `backdrop-blur-md`, `border-border`).
- SimpleGit subprocess invocation with cleanup guarantees (`cleanupClone()`).
- Parameterized openCypher queries preventing injection.
- Threat modeling matching ASVS Level 1 (strict secret redaction, timing-safe operations).

### Integration Points
- `apps/gateway/src/routes/auth.ts` (or `installations.ts`): Endpoint to list user installations and generate short-lived tokens.
- `packages/ingest/src/git/clone.ts`: `cloneRepository(repoUrl, { installationToken, ... })` with header injection and secret scrubbing.
- `packages/ingest/src/writer/queries.ts`: New openCypher query establishing `(:User)-[:IDENTIFIES]->(:Person)` edges.
- `apps/web/components/workspace/ingest-modal.tsx`: Tabbed UI for repository selection vs public URL.

</code_context>

<specifics>
## Specific Ideas
- Never embed installation tokens in the clone URL string; use `-c http.extraheader` git config parameters so `.git/config` on disk remains free of secrets.
- In `NodeInspector` and `ContributorPicker`, highlight the active user with a clear 'You' indicator when inspecting author nodes.
- When an unauthenticated visitor clicks "Your Repositories", show an inviting "Sign in with GitHub" prompt that opens the existing AuthModal directly.

</specifics>

<deferred>
## Deferred Ideas

- **SYNC-01 / SYNC-02 / SYNC-03 (Phase 8):** GitHub webhook receiver and incremental sync engine on push and pull request events.
- **ORG-01 (v3.0):** Multi-user organization team spaces with role-based access control.
- **CROSS-01 (v3.0):** Cross-repository multi-graph dependency analysis.

</deferred>

---

*Phase: 7-Authenticated Ingestion & Private Repo Selector*  
*Context gathered: 2026-10-16*

