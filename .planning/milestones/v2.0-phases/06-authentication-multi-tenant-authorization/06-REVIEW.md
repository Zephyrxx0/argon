---
status: clean
phase: "06"
depth: standard
files_reviewed: 19
issues_count: 0
---

# Phase 06: Authentication & Multi-Tenant Authorization - Code Review

## Executive Summary

A standard code review was conducted across the source files implementing **Phase 6: Authentication & Multi-Tenant Authorization**.

The scope includes GitHub OAuth and anonymous guest sessions via Better Auth, the openCypher multi-tenant graph schema (`(:User)`, `(:Organization)`, `[:ACCESSES]`) in FalkorDB, gateway pre-query tenant authorization and HS256 JWT middleware, and client recovery guards for 403 Forbidden access denial.

**Overall Status:** `clean` (all 5 initial findings resolved).
- **Security Assessment:** Strong architectural compliance. Zero Cypher injection risks (100% parameterization), robust BOLA/IDOR isolation via pre-query graph guards, explicit HS256 algorithm enforcement in JWT verification, production secret assertion, and strict privacy protection on `(:User)` nodes (no email addresses stored in FalkorDB).
- **Decisions Compliance:** Decisions [D-01 through D-16](file:///home/zeph/Code/argon/.planning/phases/06-authentication-multi-tenant-authorization/06-CONTEXT.md) are strictly implemented across both `@argon/gateway`, `apps/web`, and `packages/graph`.
- **Resolutions Applied:**
  1. Removed unused import `saveStoredPreferences` in [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L12); `tsc --noEmit` and `pnpm turbo run typecheck` now pass cleanly.
  2. Mapped `FalkorUnavailableError` in [`apps/gateway/src/middleware/tenant-auth.ts`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/tenant-auth.ts) to 503 `FALKORDB_UNREACHABLE` and sanitized 500 error outputs.
  3. Fixed workspace recovery CTA in [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx) so `handleSelectWorkspace` resets `briefingResponse: null` and `error: null`.
  4. Added production assertion in [`apps/web/lib/auth.ts`](file:///home/zeph/Code/argon/apps/web/lib/auth.ts) throwing if `BETTER_AUTH_SECRET` is unset in production.
  5. Prefixed unused `_workspace` argument in [`apps/web/tests/auth/account-linking.test.ts`](file:///home/zeph/Code/argon/apps/web/tests/auth/account-linking.test.ts).

---

## Reviewed Artifacts

The following 19 source files were reviewed:

### Gateway (`apps/gateway`)
1. [`apps/gateway/src/app.ts`](file:///home/zeph/Code/argon/apps/gateway/src/app.ts) — Gateway route mounting and middleware chaining
2. [`apps/gateway/src/middleware/jwt.ts`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/jwt.ts) — HS256 JWT Bearer verification middleware
3. [`apps/gateway/src/middleware/tenant-auth.ts`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/tenant-auth.ts) — Pre-query FalkorDB tenant authorization guard
4. [`apps/gateway/src/types.ts`](file:///home/zeph/Code/argon/apps/gateway/src/types.ts) — Error codes and auth user interface definitions

### Web Client (`apps/web`)
5. [`apps/web/lib/auth.ts`](file:///home/zeph/Code/argon/apps/web/lib/auth.ts) — Better Auth server setup, SQLite storage, anonymous plugin & JWT signer
6. [`apps/web/lib/auth-client.ts`](file:///home/zeph/Code/argon/apps/web/lib/auth-client.ts) — Better Auth client instantiation with anonymous & JWT plugins
7. [`apps/web/lib/preferences.ts`](file:///home/zeph/Code/argon/apps/web/lib/preferences.ts) — UI preference & query history localStorage retention
8. [`apps/web/app/providers.tsx`](file:///home/zeph/Code/argon/apps/web/app/providers.tsx) — Global `AuthProvider`, guest auto-minting & sign-out state machine
9. [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx) — Main dashboard wiring, token bearer passing & 403 recovery
10. [`apps/web/components/auth/auth-modal.tsx`](file:///home/zeph/Code/argon/apps/web/components/auth/auth-modal.tsx) — In-place cyberpunk Radix dialog for GitHub sign-in
11. [`apps/web/components/auth/user-button.tsx`](file:///home/zeph/Code/argon/apps/web/components/auth/user-button.tsx) — Authenticated avatar dropdown popover & sign-out trigger
12. [`apps/web/components/briefing/forbidden-card.tsx`](file:///home/zeph/Code/argon/apps/web/components/briefing/forbidden-card.tsx) — High-visibility 403 Forbidden card with showcase recovery CTA
13. [`apps/web/components/briefing/briefing-view.tsx`](file:///home/zeph/Code/argon/apps/web/components/briefing/briefing-view.tsx) — Briefing stream dispatcher handling FORBIDDEN & NOT_FOUND status
14. [`apps/web/components/navigation/header-bar.tsx`](file:///home/zeph/Code/argon/apps/web/components/navigation/header-bar.tsx) — Header bar identity cluster layout conforming to D-02

### Knowledge Graph (`packages/graph`)
15. [`packages/graph/src/schema/schema.cypher`](file:///home/zeph/Code/argon/packages/graph/src/schema/schema.cypher) — openCypher DDL for `:User`, `:Workspace`, `:Organization`, `[:ACCESSES]`
16. [`packages/graph/src/schema/init.ts`](file:///home/zeph/Code/argon/packages/graph/src/schema/init.ts) — FalkorDB schema initialization with indexes and public workspace flag
17. [`packages/graph/src/queries/auth.ts`](file:///home/zeph/Code/argon/packages/graph/src/queries/auth.ts) — `checkWorkspaceAccess`, `setUserWorkspaceAccess`, `migrateGuestAccess`
18. [`packages/graph/src/queries/index.ts`](file:///home/zeph/Code/argon/packages/graph/src/queries/index.ts) — Named query re-exports
19. [`packages/graph/src/index.ts`](file:///home/zeph/Code/argon/packages/graph/src/index.ts) — Package entry point

---

## Findings

### Blockers

#### BLOCKER-01: Unused import `saveStoredPreferences` in `apps/web/app/page.tsx` causes build failure under `noUnusedLocals`
- **Location:** [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L12)
- **Classification:** BLOCKER
- **Impact:** `pnpm turbo run typecheck` fails across the monorepo with `error TS6133: 'saveStoredPreferences' is declared but its value is never read`.
- **Description:**
  In [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L10-L15):
  ```typescript
  import {
    getStoredPreferences,
    saveStoredPreferences,
    addQueryToHistory,
    type ArgonUiPreferences,
  } from '@/lib/preferences';
  ```
  `saveStoredPreferences` is imported but never referenced in `page.tsx`. `addQueryToHistory` internally invokes `saveStoredPreferences`. Because `apps/web/tsconfig.json` inherits `"noUnusedLocals": true`, the TypeScript compiler halts with exit code 2.
- **Remediation:**
  Remove `saveStoredPreferences` from the import list on line 12 of [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L12).

---

### Warnings

#### WARNING-01: Inconsistent 500 error mapping & information disclosure in `tenantAuthMiddleware`
- **Location:** [`apps/gateway/src/middleware/tenant-auth.ts`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/tenant-auth.ts#L47-L53)
- **Classification:** WARNING
- **Impact:** Gateway returns 500 INTERNAL_ERROR with unhandled database error message rather than standard 503 FALKORDB_UNREACHABLE when FalkorDB is offline.
- **Description:**
  [`tenantAuthMiddleware`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/tenant-auth.ts#L47-L53) handles errors from [`checkWorkspaceAccess`](file:///home/zeph/Code/argon/packages/graph/src/queries/auth.ts#L26) as follows:
  ```typescript
  } catch (err: any) {
    const errorResponse: GatewayErrorResponse = {
      error: err?.message ?? 'Authorization check failed',
      code: ErrorCodes.INTERNAL_ERROR,
    };
    return c.json(errorResponse, 500);
  }
  ```
  If FalkorDB is unreachable, [`checkWorkspaceAccess`](file:///home/zeph/Code/argon/packages/graph/src/queries/auth.ts#L26) throws [`FalkorUnavailableError`](file:///home/zeph/Code/argon/packages/graph/src/client.ts#L3). While named query routes in [`apps/gateway/src/routes/query.ts`](file:///home/zeph/Code/argon/apps/gateway/src/routes/query.ts#L146-L157) map this to `503 FALKORDB_UNREACHABLE`, `tenantAuthMiddleware` returns `500 INTERNAL_ERROR`. In addition, returning `err?.message` directly in 500 responses can leak internal database connection strings or connection errors to the client.
- **Remediation:**
  Check whether `err instanceof FalkorUnavailableError` or contains connection errors, and return `503` with `ErrorCodes.FALKORDB_UNREACHABLE`. For other unexpected errors, log to server console and return a sanitized `500` error message.

---

#### WARNING-02: Workspace recovery CTA does not clear `briefingResponse` in `apps/web/app/page.tsx`
- **Location:** [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L62-L67) and [`apps/web/components/briefing/forbidden-card.tsx`](file:///home/zeph/Code/argon/apps/web/components/briefing/forbidden-card.tsx#L60-L68)
- **Classification:** WARNING
- **Impact:** Clicking "Switch to Showcase" leaves the neon red 403 Forbidden card stuck on screen.
- **Description:**
  When a user receives a 403 Forbidden error, [`ForbiddenCard`](file:///home/zeph/Code/argon/apps/web/components/briefing/forbidden-card.tsx#L60-L68) displays a "Switch to Showcase" recovery button which invokes `onSelectWorkspace?.('ember-adr-showcase')`.
  In [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L62-L67):
  ```typescript
  const handleSelectWorkspace = (wsId: string) => {
    setCurrentWorkspaceId(wsId);
    if (setActiveWorkspace) {
      setActiveWorkspace(wsId);
    }
  };
  ```
  `handleSelectWorkspace` updates `currentWorkspaceId` and `activeWorkspace`, but leaves `briefingResponse` unchanged. Because `briefingResponse.status` is still `'FORBIDDEN'`, [`BriefingView`](file:///home/zeph/Code/argon/apps/web/components/briefing/briefing-view.tsx#L75) continues to render `ForbiddenCard`, preventing the user from returning to [`ShowcaseHub`](file:///home/zeph/Code/argon/apps/web/components/hub/showcase-hub.tsx) unless they submit a new query. In contrast, `handleResetWorkspace` in line 50 correctly clears `setBriefingResponse(null)`.
- **Remediation:**
  In [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx), clear `briefingResponse` and `error` in `handleSelectWorkspace` when switching away from a forbidden/error state:
  ```typescript
  const handleSelectWorkspace = (wsId: string) => {
    setCurrentWorkspaceId(wsId);
    if (setActiveWorkspace) {
      setActiveWorkspace(wsId);
    }
    setBriefingResponse(null);
    setError(null);
  };
  ```

---

#### WARNING-03: Hardcoded fallback secret in `apps/web/lib/auth.ts` in production environments
- **Location:** [`apps/web/lib/auth.ts`](file:///home/zeph/Code/argon/apps/web/lib/auth.ts#L70)
- **Classification:** WARNING
- **Impact:** Potential security risk if deployed in production without setting `BETTER_AUTH_SECRET`.
- **Description:**
  [`apps/web/lib/auth.ts`](file:///home/zeph/Code/argon/apps/web/lib/auth.ts#L70) specifies:
  ```typescript
  const secretKey = process.env.BETTER_AUTH_SECRET || 'argon-dev-secret-at-least-32-chars-long';
  ```
  While suitable for unit testing, if `BETTER_AUTH_SECRET` is omitted in production, Better Auth will issue JWTs signed with a publicly known string, while the gateway ([`apps/gateway/src/middleware/jwt.ts`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/jwt.ts#L11-L17)) will refuse requests with `500 AUTH_CONFIG_ERROR`.
- **Remediation:**
  Add a production environment assertion that throws on startup if `process.env.NODE_ENV === 'production'` and `BETTER_AUTH_SECRET` is unset.

---

### Suggestions

#### SUGGESTION-01: Prefix unused mock parameters in `apps/web/tests/auth/account-linking.test.ts`
- **Location:** [`apps/web/tests/auth/account-linking.test.ts`](file:///home/zeph/Code/argon/apps/web/tests/auth/account-linking.test.ts#L11) & [L44](file:///home/zeph/Code/argon/apps/web/tests/auth/account-linking.test.ts#L44)
- **Classification:** SUGGESTION
- **Impact:** Minor TypeScript compiler diagnostics during test execution.
- **Description:**
  The mock function `mockImplementation(async (workspace: string, cypher: string, params: any) => ...)` declares `workspace` but does not use it. Prefixing with an underscore (`_workspace`) avoids TS6133 warnings.

---

## Adherence to Decisions (D-01 to D-16)

| Decision | Summary | Status | Notes |
|:---|:---|:---:|:---|
| **D-01** | In-place modal dialog for GitHub sign-in | **PASS** | [`AuthModal`](file:///home/zeph/Code/argon/apps/web/components/auth/auth-modal.tsx) uses Radix Dialog; preserves canvas and briefing state. |
| **D-02** | HeaderBar identity cluster layout | **PASS** | Renders Guest pill + Sign In when anonymous, [`UserButton`](file:///home/zeph/Code/argon/apps/web/components/auth/user-button.tsx) avatar when authenticated, positioned right of `ContributorPicker`. |
| **D-03** | Monospace dark cyberpunk styling | **PASS** | Monospace typography, cyber accent borders (`#00f0ff`, `#ff0055`), translucent overlays matching design specs. |
| **D-04** | Global `AuthProvider` & `useAuth()` hook | **PASS** | Implemented in [`apps/web/app/providers.tsx`](file:///home/zeph/Code/argon/apps/web/app/providers.tsx), managing session hydration, `isAnonymous`, and token retrieval. |
| **D-05** | Signed JWT Bearer token transport | **PASS** | Requests attach `Authorization: Bearer <jwt>`, verified by gateway middleware. |
| **D-06** | Uniform anonymous guest JWTs | **PASS** | Anonymous sessions receive stateless JWT with `isAnonymous: true` and subject claim. |
| **D-07** | Short-lived JWTs (15 min) | **PASS** | Configured with `setExpirationTime('15m')` in [`apps/web/lib/auth.ts`](file:///home/zeph/Code/argon/apps/web/lib/auth.ts#L115). |
| **D-08** | HS256 HMAC-SHA256 with shared secret | **PASS** | Explicitly specified `'HS256'` in both token generation and verification. |
| **D-09** | openCypher multi-tenant model | **PASS** | Schema models `(:User)-[:ACCESSES { role }]->(:Workspace)` with `is_public: boolean`. |
| **D-10** | Privacy-preserving `(:User)` nodes | **PASS** | FalkorDB schema and queries store `id`, `github_id`, `login`, `avatar_url`; **no emails**. |
| **D-11** | Pre-query FalkorDB tenant guard | **PASS** | [`checkWorkspaceAccess`](file:///home/zeph/Code/argon/packages/graph/src/queries/auth.ts#L26) uses `OPTIONAL MATCH` pattern avoiding unsupported nested `EXISTS { MATCH ... }`. |
| **D-12** | 403 Forbidden vs 404 Not Found error format | **PASS** | Gateway returns 404 for missing workspaces and 403 `{ error: 'Workspace access denied', code: 'FORBIDDEN' }`. |
| **D-13** | Guest-to-user account linking | **PASS** | Configured `onLinkAccount` callback in Better Auth anonymous plugin. |
| **D-14** | openCypher graph access migration | **PASS** | [`migrateGuestAccess`](file:///home/zeph/Code/argon/packages/graph/src/queries/auth.ts#L87) reassigns `[:ACCESSES]` edges and detaches ephemeral guest node. |
| **D-15** | Sign-out state machine | **PASS** | Revokes session, mints fresh guest identity, resets workspace to `ember-adr-showcase`, dispatches `argon:reset-workspace`. |
| **D-16** | LocalStorage UI preference retention | **PASS** | Layout mode, panel sizes, and query history preserved in `localStorage` under `argon_ui_preferences` across auth state transitions. |

---

## Security & Robustness Analysis

1. **BOLA / IDOR Verification:**
   All workspace routes under `/api/v1/:workspaceId/*` are intercepted by [`tenantAuthMiddleware`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/tenant-auth.ts#L10) before delegating to named queries or briefing generation. Callers cannot tamper with `workspaceId` or access private workspaces without an explicit `[:ACCESSES]` edge in FalkorDB.
2. **Cypher Injection:**
   All queries in [`packages/graph/src/queries/auth.ts`](file:///home/zeph/Code/argon/packages/graph/src/queries/auth.ts) and [`packages/graph/src/schema/init.ts`](file:///home/zeph/Code/argon/packages/graph/src/schema/init.ts) use strict parameter maps (`$workspaceId`, `$userId`, `$role`, `$guestId`, `$authUserId`). No dynamic Cypher concatenation with user inputs exists.
3. **Secret Security:**
   Secrets are isolated to environment variables (`BETTER_AUTH_SECRET`, `GATEWAY_SECRET`). Backward compatibility with static dev secret is safeguarded against empty or whitespace strings.
4. **JWT Verification Algorithm:**
   `hono/jwt` `verify(token, secret, 'HS256')` strictly enforces the HS256 algorithm parameter, preventing algorithm confusion or 'none' algorithm bypasses.

---

## Conclusion & Next Steps

Phase 6 provides a complete, robust, and privacy-preserving authentication and multi-tenant authorization implementation conforming to all architectural constraints.

To achieve clean build status, address:
1. **BLOCKER-01:** Remove unused import `saveStoredPreferences` in [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx#L12) so `pnpm turbo run typecheck` succeeds.
2. **WARNING-01 & WARNING-02:** Align error mapping in [`tenantAuthMiddleware`](file:///home/zeph/Code/argon/apps/gateway/src/middleware/tenant-auth.ts) to return `503` when FalkorDB is offline, and clear `briefingResponse` on workspace switch in [`apps/web/app/page.tsx`](file:///home/zeph/Code/argon/apps/web/app/page.tsx).
