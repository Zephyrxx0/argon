---
phase: 06-authentication-multi-tenant-authorization
plan: "03"
subsystem: tenant-auth
tags: [better-auth, graph-migration, opencypher, sign-out, local-storage, 403-forbidden, nyquist]

# Dependency graph
requires:
  - phase: 06-authentication-multi-tenant-authorization
    plan: "01"
    provides: Better Auth server and client with HS256 JWT Bearer token issuance and AuthProvider
  - phase: 06-authentication-multi-tenant-authorization
    plan: "02"
    provides: FalkorDB openCypher tenant schema, checkWorkspaceAccess, and gateway tenant guard
provides:
  - Guest-to-user account linking hook migrating temporary graph accesses to authenticated users via openCypher
  - Sign-out state machine revoking session, immediately minting fresh anonymous guest identity, and resetting workspace to ember-adr-showcase
  - Preservation of client UI preferences (Cytoscape layout mode, panel widths, query history) in localStorage across session transitions
  - High-visibility 403 Forbidden error card with cyberpunk border and "Switch to Showcase" recovery action
affects: [web, gateway, graph]

actuals:
  tokens: 4400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: [openCypher ACCESSES transfer and DETACH DELETE guest, seamless anonymous minting on sign-out, persistent developer UI state in localStorage, 403 Forbidden recovery guard]

key-files:
  created:
    - apps/web/lib/preferences.ts
    - apps/web/components/briefing/forbidden-card.tsx
    - apps/web/tests/auth/account-linking.test.ts
    - apps/web/tests/auth/sign-out-preferences.test.ts
    - apps/web/tests/components/forbidden-guard.test.tsx
  modified:
    - packages/graph/src/queries/auth.ts
    - packages/graph/src/index.ts
    - apps/web/lib/auth.ts
    - apps/web/app/providers.tsx
    - apps/web/app/page.tsx
    - apps/web/components/briefing/briefing-view.tsx

key-decisions:
  - "Implemented migrateGuestAccess in openCypher transferring [:ACCESSES] edges from guest to permanent user and detaching ephemeral guest node conforming to D-14"
  - "Configured Better Auth onLinkAccount callback to dynamically invoke migrateGuestAccess upon guest-to-authenticated linking conforming to D-13"
  - "Structured signOut state machine to revoke authenticated session, immediately mint fresh guest identity, reset workspace to ember-adr-showcase, and dispatch argon:reset-workspace event without hard page reload conforming to D-15"
  - "Preserved client UI preferences (Cytoscape layout mode, panel sizes, query history) in localStorage under argon_ui_preferences across logins and logouts conforming to D-16"
  - "Rendered neon red (#ff0055) 403 Forbidden card in BriefingView with 'Switch to Showcase' recovery CTA switching workspace back to ember-adr-showcase conforming to UI-SPEC.md and D-12"

patterns-established:
  - "Atomic graph migration: Reassignment of [:ACCESSES] edges and deletion of ephemeral guest node in a single openCypher transaction"
  - "Zero-wall session transitions: Signing out establishes a clean anonymous session instantaneously, allowing visitors to continue exploring without disruption"
  - "Resilient multi-tenant recovery: 403 Forbidden errors provide immediate recovery path to default showcase workspace"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - TENANT-01

coverage:
  - id: D13-D14
    description: "Better Auth onLinkAccount callback triggers migrateGuestAccess transferring [:ACCESSES] edges and detaching guest node"
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "apps/web/tests/auth/account-linking.test.ts"
        status: pass
    human_judgment: false
  - id: D15-D16
    description: "Sign-out revokes session, mints anonymous identity, resets workspace to ember-adr-showcase, and preserves localStorage UI preferences"
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: "apps/web/tests/auth/sign-out-preferences.test.ts"
        status: pass
    human_judgment: false
  - id: D12-GUARD
    description: "403 Forbidden access denial renders neon red card with Switch to Showcase CTA"
    requirement: TENANT-01
    verification:
      - kind: component
        ref: "apps/web/tests/components/forbidden-guard.test.tsx"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-16
status: complete
---

# Phase 6: Plan 03 Summary

**Guest-to-authenticated account linking openCypher migration, sign-out state machine resetting to showcase workspace, localStorage UI preference retention, and frontend 403 Forbidden recovery guard**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-16T09:33:30Z
- **Completed:** 2026-10-16T09:58:30Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Implemented `migrateGuestAccess` in `packages/graph/src/queries/auth.ts` executing openCypher to transfer temporary `[:ACCESSES]` relationships from guest accounts to permanent authenticated users, copy role permissions, and detach/delete ephemeral guest nodes (D-14).
- Exported auth queries (`migrateGuestAccess`, `checkWorkspaceAccess`, `setUserWorkspaceAccess`) from `@argon/graph` index.
- Wired Better Auth `onLinkAccount` callback in `apps/web/lib/auth.ts` to automatically invoke `migrateGuestAccess` when anonymous visitors sign in with GitHub (D-13).
- Implemented sign-out state machine in `apps/web/app/providers.tsx` revoking active session credentials, immediately minting a fresh anonymous guest session, resetting active workspace back to `ember-adr-showcase`, and dispatching custom `argon:reset-workspace` events (D-15).
- Created centralized UI preference manager in `apps/web/lib/preferences.ts` storing Cytoscape layout mode, split viewport panel dimensions, and query history under `argon_ui_preferences` in `localStorage`, guaranteeing full developer canvas continuity across logins and logouts (D-16).
- Built high-visibility neon red (`#ff0055`) 403 Forbidden card and 404 warning banner in `apps/web/components/briefing/forbidden-card.tsx` and `briefing-view.tsx`, pairing access denial feedback with a "Switch to Showcase" recovery CTA that routes back to `ember-adr-showcase` (UI-SPEC.md, D-12).
- Validated the full repository test suite (`pnpm test`): all 8 package test suites and 165+ tests pass with 0 regressions.

## Task Commits

Each task was committed atomically:

1. **Task 06-03-01: Implement guest-to-user account linking and openCypher graph migration** - `9b376b9` (feat)
2. **Task 06-03-02: Implement sign-out state machine, workspace reset, and localStorage preference retention** - `18e6633` (feat)
3. **Task 06-03-03: Implement 403 Forbidden UI recovery view and verify end-to-end multi-tenant pipeline** - `92b995c` (feat)

## Files Created/Modified

- `packages/graph/src/queries/auth.ts`: Added optional `workspaceId` support and detached node cleanup to `migrateGuestAccess`.
- `packages/graph/src/index.ts`: Explicitly exported auth queries and type interfaces.
- `apps/web/lib/auth.ts`: Defined `onLinkAccount` callback connecting Better Auth to `migrateGuestAccess`.
- `apps/web/app/providers.tsx`: Added `activeWorkspace` context state, event dispatch, and enhanced `signOut` transition.
- `apps/web/app/page.tsx`: Wired `activeWorkspace` state, `argon:reset-workspace` event listener, preference hydration, and 403/404 response handling.
- `apps/web/lib/preferences.ts`: Centralized helper for managing `argon_ui_preferences` and `query_history` in `localStorage`.
- `apps/web/components/briefing/forbidden-card.tsx`: High-visibility cyberpunk 403 Forbidden and 404 Not Found guard cards with "Switch to Showcase" CTA.
- `apps/web/components/briefing/briefing-view.tsx`: Integrated `FORBIDDEN` and `NOT_FOUND` response rendering.
- `apps/web/tests/auth/account-linking.test.ts`: Integration test verifying openCypher access migration and `onLinkAccount` hook invocation.
- `apps/web/tests/auth/sign-out-preferences.test.ts`: Unit test verifying sign-out session revocation, anonymous auto-minting, workspace reset, and preference retention.
- `apps/web/tests/components/forbidden-guard.test.tsx`: Component test verifying 403 Forbidden card copy and recovery CTA callback.

## Decisions Made

- Detached and cleaned up ephemeral guest nodes in `migrateGuestAccess` both during edge reassignment and as a fallback if the guest had zero custom accesses, preventing orphan guest nodes in the graph database.
- Maintained client SPA continuity during `signOut` by avoiding full-window reloads (`window.location.href = '/'`), updating React context state and dispatching a local custom event instead.
- Retained developer UI preferences in `localStorage` across all session transitions conforming to Decision D-16.
- Provided one-click recovery via "Switch to Showcase" button in 403 Forbidden card to return users safely to `ember-adr-showcase`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Type/Build Sync] Compiled `@argon/graph` after query updates**
- **Found during:** Task 06-03-01 (`pnpm --filter web test run tests/auth/account-linking.test.ts`)
- **Issue:** Web package imports `@argon/graph` from `dist/src/index.js`, which required recompilation via `tsc`.
- **Fix:** Ran `pnpm --filter @argon/graph build` to ensure `dist/` was in sync with source changes.
- **Files modified:** `packages/graph/dist/*`
- **Verification:** `tests/auth/account-linking.test.ts` passed cleanly.
- **Committed in:** `9b376b9`

**2. [Rule 2 - Test Syntax Compatibility] Replaced JSX with React.createElement in `.test.ts` file**
- **Found during:** Task 06-03-02 (`tests/auth/sign-out-preferences.test.ts`)
- **Issue:** Vitest esbuild loader does not transform JSX inside `.ts` files unless named `.tsx`.
- **Fix:** Used standard `React.createElement` within `tests/auth/sign-out-preferences.test.ts` to preserve `.ts` filename mandated by the plan.
- **Files modified:** `apps/web/tests/auth/sign-out-preferences.test.ts`
- **Verification:** `tests/auth/sign-out-preferences.test.ts` passed cleanly.
- **Committed in:** `18e6633`

## User Setup Required

None.

## Phase 6 Completion

Plan 06-03 is complete, fulfilling all requirements of Phase 6: Authentication & Multi-Tenant Authorization (AUTH-01, AUTH-02, TENANT-01).
