# Phase 6: Authentication & Multi-Tenant Authorization - Context

**Gathered:** 2026-10-16  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Phase 6 implements GitHub OAuth authentication and anonymous guest sessions via Better Auth in `apps/web` with `@better-auth-ui/all` components, extends the FalkorDB openCypher graph schema to support multi-tenant isolation (`(:User)`, `(:Organization)`, `[:ACCESSES]`), and enforces tenant authorization middleware in `apps/gateway` so unauthorized graph queries return `403 Forbidden` while allowing guest exploration of public showcase workspaces.

</domain>

<decisions>
## Implementation Decisions

### 1. Auth UI & HeaderBar Integration
- **D-01:** GitHub sign-in flow is presented via an in-place modal dialog powered by `@better-auth-ui` components so the user never loses their active graph canvas or briefing state. — **Reversibility:** reversible — UI presentation choice.
- **D-02:** HeaderBar renders a subtle guest indicator with a 'Sign In' button when anonymous, switching to a user avatar with dropdown popover (profile, sign out, switch account) when authenticated, positioned immediately right of `ContributorPicker`. — **Reversibility:** reversible — Component composition within HeaderBar.
- **D-03:** Use `npx shadcn@latest add @better-auth-ui/all` to scaffold components into `apps/web/components/auth/` and `apps/web/components/ui/`, styled with Tailwind v4 dark/cyberpunk tokens matching Argon's monospace terminal aesthetics. — **Reversibility:** costly — Generates shared UI components and shadcn configuration in `apps/web`.
- **D-04:** Better Auth client session state is managed via a global `AuthProvider` in `app/providers.tsx` exposing a `useAuth()` hook with active session, guest status flag, and sign-in/out triggers. — **Reversibility:** costly — Consumed across multiple web components and route handlers.

### 2. Session & Gateway Token Transport
- **D-05:** Client-to-gateway API requests use signed JWT Bearer tokens (`Authorization: Bearer <jwt>`) issued by Better Auth (`jwt` plugin) containing `userId`, `isAnonymous`, and expiration, verified by the Hono gateway. — **Reversibility:** one-way — Defines the HTTP authentication protocol contract between `apps/web` and `apps/gateway`.
- **D-06:** Anonymous guest requests also receive a stateless anonymous JWT with `isAnonymous: true` and an ephemeral `guest_<uuid>` subject from Better Auth's `anonymous()` plugin, providing uniform and auditable token handling across all gateway endpoints. — **Reversibility:** costly — Unifies token verification pipeline in gateway middleware.
- **D-07:** JWT tokens are short-lived (15–60 minutes) with silent background refresh via the Better Auth session cookie in `apps/web`. — **Reversibility:** reversible — Configured in token issuance options and client refresh hooks.
- **D-08:** Token signing and verification use HMAC-SHA256 (HS256) with a shared `BETTER_AUTH_SECRET` environment variable configured in both `apps/web` and `apps/gateway`, eliminating external network calls or JWKS lookups. — **Reversibility:** reversible — Can be upgraded to asymmetric RS256/EdDSA later if services decouple.

### 3. Multi-Tenant Access Model
- **D-09:** Multi-tenant access in FalkorDB is modeled as `(:User)-[:ACCESSES { role: 'owner' | 'member' | 'viewer' }]->(:Workspace)` with an `is_public: boolean` property on `(:Workspace)` for public showcase workspaces (e.g. `ember-adr-showcase`). — **Reversibility:** one-way — openCypher graph schema and traversal contract used across all repository workspaces.
- **D-10:** Privacy-preserving `(:User)` nodes in FalkorDB store `id` (primary key matching Better Auth `userId`), `github_id`, `login` (GitHub username), `avatar_url`, and `created_at` (no emails stored in the graph database). — **Reversibility:** costly — Determines graph node schema and privacy boundaries.
- **D-11:** Gateway verifies workspace authorization using a pre-query Cypher guard: `MATCH (w:Workspace {id: $ws}) WHERE w.is_public = true OR EXISTS { MATCH (u:User {id: $userId})-[:ACCESSES]->(w) } RETURN count(w) > 0 AS allowed` before delegating to named queries. — **Reversibility:** costly — Implemented as middleware protecting all `/api/v1/query` and `/api/v1/briefing` routes.
- **D-12:** Unauthorized workspace access returns `403 Forbidden` with `{ error: 'Workspace access denied', code: 'FORBIDDEN' }` when the workspace exists, and `404 Not Found` if the workspace does not exist. — **Reversibility:** reversible — Gateway HTTP error formatting.

### 4. Guest-to-Authenticated Account Linking
- **D-13:** When an anonymous visitor signs in with GitHub, Better Auth seamlessly links the anonymous session to the authenticated GitHub account, transferring session state, guest workspace accesses, and preferences. — **Reversibility:** costly — Relies on Better Auth `anonymous()` account linking flow.
- **D-14:** Graph access migration runs via an auth callback/hook executing openCypher: `MATCH (guest:User {id: $guestId})-[r:ACCESSES]->(w) MERGE (u:User {id: $authUserId}) MERGE (u)-[r2:ACCESSES]->(w) SET r2 = properties(r) DETACH DELETE guest` to reassign temporary workspace accesses to the permanent user. — **Reversibility:** costly — Database graph migration hook logic.
- **D-15:** Signing out revokes the authenticated session cookie, immediately mints a fresh anonymous guest session, and switches the active workspace back to the default showcase workspace (`ember-adr-showcase`). — **Reversibility:** reversible — Client sign-out state machine.
- **D-16:** Client-side UI preferences (Cytoscape graph layout mode, panel widths, query history) are preserved across session state changes in `localStorage`. — **Reversibility:** reversible — Browser storage client logic.

### the agent's Discretion
- Exact Tailwind CSS utility class fine-tuning for dark cyberpunk styling of `@better-auth-ui` components.
- Internal error logging format in gateway authentication middleware.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture & Requirements
- `.planning/PROJECT.md` — Project memory core values, architecture constraints, and tech stack guidelines.
- `.planning/REQUIREMENTS.md` — Requirements AUTH-01 (GitHub OAuth), AUTH-02 (Anonymous Guest Plugin), and TENANT-01 (Multi-Tenant Access Isolation).
- `.planning/ROADMAP.md` §Phase 6 — Scope, goal, and success criteria for Phase 6.
- `.planning/v2.0-MILESTONE-SPEC.md` §2 & §3 — Milestone v2.0 specification for authentication and multi-tenant authorization.

### Codebase Implementations
- `apps/web/components/navigation/header-bar.tsx` — HeaderBar layout and placement for identity controls.
- `apps/gateway/src/app.ts` — Hono application routes and middleware wiring.
- `apps/gateway/src/middleware/auth.ts` — Existing bearer authentication middleware to be upgraded with JWT verification.
- `packages/graph/src/schema/` — FalkorDB schema definitions and openCypher indices.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/components/navigation/header-bar.tsx`: Existing header component containing `Terminal` branding, `CommandBar`, `WorkspaceSwitcher`, and `ContributorPicker`.
- `apps/gateway/src/middleware/auth.ts`: Existing Hono middleware for bearer token validation, readily adaptable to decode and verify Better Auth JWTs.
- `packages/graph/src/client.ts`: `ArgonGraphClient` providing typed `query()` and transaction methods over FalkorDB.

### Established Patterns
- Monorepo package management via `pnpm` and Turborepo.
- Monospace dark aesthetic (`font-mono`, `bg-card/95`, `backdrop-blur-md`, `border-border`, cybernetic accents).
- Named parameterized queries in `packages/graph` preventing Cypher injection and enforcing deterministic traversal.

### Integration Points
- `apps/web/app/api/auth/[...all]/route.ts`: Better Auth Next.js API route handler for OAuth callbacks and session management.
- `apps/web/app/providers.tsx`: Client provider hierarchy wrapping the app layout.
- `apps/gateway/src/middleware/tenant-auth.ts`: New gateway middleware verifying JWT claims and querying FalkorDB for workspace authorization.
- `packages/graph/src/schema/schema.cypher`: Schema definition file to be updated with `:User` label, uniqueness constraints, and index definitions.

</code_context>

<specifics>
## Specific Ideas
- User directive: Use `npx shadcn@latest add @better-auth-ui/all` for UI components.
- Keep the UI seamless: unauthenticated visitors should never encounter a forced login wall or modal redirect loop when exploring public showcase graphs.

</specifics>

<deferred>
## Deferred Ideas

- **ORG-01 (v3.0):** Multi-user organization team spaces with role-based access control (Admin, Member, Viewer) beyond workspace-level edges.
- **CROSS-01 (v3.0):** Cross-repository multi-graph dependency and shared library impact analysis.
- **SLACK-01 (v3.0):** Slack bot integration triggering Argon briefings directly from PR comments.

</deferred>

---

*Phase: 6-Authentication & Multi-Tenant Authorization*  
*Context gathered: 2026-10-16*

