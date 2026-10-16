# Phase 6: Authentication & Multi-Tenant Authorization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16  
**Phase:** 6-Authentication & Multi-Tenant Authorization  
**Areas discussed:** Auth UI & HeaderBar Integration, Session & Gateway Token Transport, Multi-Tenant Access Model, Guest-to-Authenticated Account Linking  

---

## Auth UI & HeaderBar Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Modal Dialog | A modal dialog powered by @better-auth-ui components opens in-place without losing the user's active graph canvas or briefing state | ✓ |
| Direct GitHub Redirect | Clicking 'Sign in with GitHub' immediately navigates to GitHub OAuth and redirects back to the current workspace URL | |
| Dedicated /auth Page | Route navigation to a clean /auth or /login page containing the Better Auth UI cards, redirecting back upon completion | |

**User's choice:** Modal Dialog  
**Notes:** Keeps the visual Cytoscape graph canvas state uninterrupted when initiating authentication.

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle Guest Indicator | Subtle Guest Indicator with 'Sign In' button when anonymous, switching to User Avatar + Dropdown Popover (profile, sign out, switch account) when authenticated | ✓ |
| UserButton Component | UserButton component from @better-auth-ui directly embedded in HeaderBar on the far right with built-in trigger modal | |
| Icon-only GitHub mark | Icon-only GitHub mark with status dot (gray = guest, green = authenticated) opening the profile/auth modal on click | |

**User's choice:** Subtle Guest Indicator  
**Notes:** Placed directly right of `ContributorPicker` in `apps/web/components/navigation/header-bar.tsx`.

| Option | Description | Selected |
|--------|-------------|----------|
| Monospace Cyberpunk Theme | Install into `apps/web/components/auth/` & `apps/web/components/ui/` with Tailwind v4 dark/cyberpunk theme styling matching the existing Argon monospace aesthetics | ✓ |
| Default shadcn placement | Standard `@/components/ui` components with default shadcn slate/neutral tokens | |
| You decide | Choose the cleanest location that adheres to Argon's existing styling and Tailwind config | |

**User's choice:** Monospace Cyberpunk Theme  
**Notes:** Specified by user to execute `npx shadcn@latest add @better-auth-ui/all`.

| Option | Description | Selected |
|--------|-------------|----------|
| Global AuthProvider | Global AuthProvider in `app/providers.tsx` wrapping the application, exposing `useAuth()` with active session, guest status, and sign-in/out triggers | ✓ |
| Direct Hook Usage | Direct `authClient.useSession()` hook usage inside components without a custom wrapper provider | |
| React Context + RSC | React Context coupled with Next.js Server Components passing initial session via root layout | |

**User's choice:** Global AuthProvider in `app/providers.tsx`  
**Notes:** Standardized client-side auth context for guest & authenticated states.

---

## Session & Gateway Token Transport

| Option | Description | Selected |
|--------|-------------|----------|
| Signed JWT Bearer | Better Auth generates a signed JWT (containing userId, guest flag, and expiration) sent as `Authorization: Bearer <jwt>`, verified by Hono gateway using shared secret/public key | ✓ |
| Gateway Shared Secret + User Header | Web app verifies session, forwards request to gateway with `Authorization: Bearer <GATEWAY_SECRET>` and `X-User-Id` / `X-User-Role` headers | |
| Direct Session Verification Endpoint | Gateway calls back to Better Auth `/api/auth/get-session` to validate cookies on incoming requests | |

**User's choice:** Signed JWT Bearer  
**Notes:** Decoupled stateless authentication with standard bearer tokens.

| Option | Description | Selected |
|--------|-------------|----------|
| Anonymous JWT | Even guests receive a stateless anonymous JWT with `isAnonymous: true` and an ephemeral `guest_<uuid>` subject, keeping gateway auth uniform and auditable | ✓ |
| Optional Bearer | Gateway allows missing Authorization header for public showcase workspaces, falling back to an unauthenticated guest context | |
| Static Guest Token | Web app sends a well-known static guest token for all unauthenticated calls | |

**User's choice:** Anonymous JWT  
**Notes:** Gateway auth pipeline remains uniform across all request types.

| Option | Description | Selected |
|--------|-------------|----------|
| Short-lived JWT (15-60 min) | Short-lived JWT (15-60 min) with silent automatic background refresh via Better Auth session cookie in the web client | ✓ |
| Long-lived JWT (7 days) | Long-lived JWT (7 days) matching cookie expiration to eliminate refresh complexity during active sessions | |
| You decide | Standard pattern for stateless cookie-backed JWTs | |

**User's choice:** Short-lived JWT (15-60 min)  
**Notes:** Limits blast radius while retaining seamless user experience via cookie refresh.

| Option | Description | Selected |
|--------|-------------|----------|
| Shared Secret (HS256) | Use the same `BETTER_AUTH_SECRET` in both `apps/web` and `apps/gateway` environment configuration for fast, zero-dependency HMAC signature verification | ✓ |
| Asymmetric Keys (RS256/EdDSA) | Private key in `apps/web` for signing, public key mounted in `apps/gateway` for verification | |
| JWKS URL Verification | Gateway fetches public JWKS directly from `apps/web/.well-known/jwks.json` on startup / cache | |

**User's choice:** Shared Secret (HS256)  
**Notes:** Minimal dependencies and lightning-fast verification in Hono gateway.

---

## Multi-Tenant Access Model

| Option | Description | Selected |
|--------|-------------|----------|
| ACCESSES Edge with Roles & is_public | `(:User)-[:ACCESSES { role: 'owner' \| 'member' \| 'viewer' }]->(:Workspace)` with a `is_public: boolean` property on `(:Workspace)` for public showcase workspaces | ✓ |
| Distinct Edges | `(:User)-[:OWNS]->(:Workspace)` for owners and `(:User)-[:ACCESSES]->(:Workspace)` for read-only guests/members | |
| Flat Workspace Ownership | `(:User)-[:OWNS]->(:Workspace)` only; workspace sharing deferred to v3.0 | |

**User's choice:** ACCESSES Edge with Roles & is_public  
**Notes:** Supports both private user repositories and public showcase repositories cleanly.

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal & Privacy-Preserving | Store `id` (primary key matching Better Auth userId), `github_id`, `login` (username), `avatar_url`, and `created_at` (no emails stored in graph) | ✓ |
| Comprehensive | Store `id`, `github_id`, `login`, `email`, `name`, `avatar_url`, and `last_login_at` | |
| You decide | Align with privacy best practices for openCypher developer graphs | |

**User's choice:** Minimal & Privacy-Preserving  
**Notes:** Protects user email privacy inside the graph database.

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-query Cypher Guard | Gateway executes a lightweight `MATCH (w:Workspace {id: $ws}) WHERE w.is_public = true OR EXISTS { MATCH (u:User {id: $userId})-[:ACCESSES]->(w) } RETURN count(w) > 0 AS allowed` before delegating to named queries | ✓ |
| Query Parameter Inlining | Rewrite all named queries to include `MATCH (u:User {id: $userId})-[:ACCESSES]->(w:Workspace {id: $ws})` inside every openCypher template | |
| In-Memory Gateway Cache | Cache workspace access permissions in gateway memory (TTL 60s) to minimize FalkorDB round-trips | |

**User's choice:** Pre-query Cypher Guard  
**Notes:** Centralized guard in gateway route middleware; named queries stay clean.

| Option | Description | Selected |
|--------|-------------|----------|
| Standard 403 Forbidden | Standard 403 Forbidden with `{ error: 'Workspace access denied', code: 'FORBIDDEN' }` when workspace exists but access is lacking, 404 if workspace does not exist | ✓ |
| Uniform 404 Not Found | Return 404 for both non-existent workspaces and unauthorized private workspaces | |
| 401/403 Distinction | 401 Unauthorized for invalid/missing JWT, 403 Forbidden for existing workspace without ACCESSES edge | |

**User's choice:** Standard 403 Forbidden  
**Notes:** Standard HTTP semantics for authorization failures.

---

## Guest-to-Authenticated Account Linking

| Option | Description | Selected |
|--------|-------------|----------|
| Seamless Account Linking | Better Auth merges the anonymous guest account into the authenticated GitHub account, transferring session state, guest workspace accesses, and preferences | ✓ |
| Fresh Session Transition | Terminate the anonymous session and establish a clean authenticated GitHub session | |
| User Choice Prompt | Ask the user whether they want to import their guest browsing history/workspaces or start fresh | |

**User's choice:** Seamless Account Linking  
**Notes:** Native Better Auth `anonymous()` plugin account linking.

| Option | Description | Selected |
|--------|-------------|----------|
| Post-link Graph Migration Hook | A Better Auth callback fires an openCypher transaction updating `MATCH (guest:User {id: $guestId})-[r:ACCESSES]->(w) MERGE (u:User {id: $authUserId}) MERGE (u)-[r2:ACCESSES]->(w) SET r2 = properties(r) DETACH DELETE guest` | ✓ |
| Lazy Workspace Transfer | Keep guest edges until the user opens the workspace while authenticated | |
| Read-Only Guests | Guests only ever browse public showcase workspaces | |

**User's choice:** Post-link Graph Migration Hook  
**Notes:** Atomically reassigns temporary graph permissions to the newly authenticated GitHub user.

| Option | Description | Selected |
|--------|-------------|----------|
| Return to Anonymous Guest Session | Revoke the authenticated session cookie, immediately mint a new anonymous guest session, and switch the UI back to the default public showcase workspace (`ember-adr-showcase`) | ✓ |
| Pure Unauthenticated State | Clear all cookies and render an explicit unauthenticated hero banner | |
| You decide | Standard Better Auth sign-out flow with seamless fall-through to anonymous guest mode | |

**User's choice:** Return to Anonymous Guest Session  
**Notes:** Zero dead-ends or empty screens; user can continue browsing public graphs immediately.

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve Local Preferences | Keep client-side UI preferences (layout, zoom, panel widths, query history) intact in `localStorage` across authentication state transitions | ✓ |
| Isolate Per Account | Store UI preferences in keyed namespaces (`argon_pref_${userId}`) | |
| You decide | Keep local state simple and frictionless across transitions | |

**User's choice:** Preserve Local Preferences  
**Notes:** Frictionless transition preserves viewport layout, canvas settings, and query history.

---

## the agent's Discretion

- Tailwind CSS dark/cyberpunk aesthetic token mappings for shadcn `@better-auth-ui/all` components.
- Specific debug log formatting in gateway JWT middleware.

## Deferred Ideas

- **ORG-01 (v3.0):** Multi-user organization team spaces with role-based access control (Admin, Member, Viewer).
- **CROSS-01 (v3.0):** Cross-repository multi-graph dependency and shared library impact analysis.
- **SLACK-01 (v3.0):** Slack bot integration triggering Argon briefings directly from PR comments.

