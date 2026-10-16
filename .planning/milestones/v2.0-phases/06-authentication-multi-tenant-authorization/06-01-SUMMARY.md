---
phase: 06-authentication-multi-tenant-authorization
plan: "01"
subsystem: auth
tags: [better-auth, jwt, anonymous-guest, github-oauth, radix-ui, next-js, react]

# Dependency graph
requires:
  - phase: 04-ui-ux-polishing
    provides: HeaderBar, SplitViewport, Cytoscape canvas and dark theme tokens
provides:
  - Better Auth server configuration with SQLite, GitHub OAuth, anonymous guest plugin, and HS256 JWT issuance
  - Better Auth client with anonymous and JWT plugins
  - Global AuthProvider with session hydration, anonymous auto-minting, and getToken() Bearer provider
  - In-place cyberpunk AuthModal dialog preserving Cytoscape canvas state
  - UserButton avatar popover with profile info and sign out actions
  - HeaderBar identity cluster (guest pill / sign-in button switching to user avatar) positioned right of ContributorPicker
affects: [06-02, 06-03, gateway, web]

actuals:
  tokens: 4200
  tasks: 3
  commits: 3

tech-stack:
  added: [better-auth, better-sqlite3, jose, "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-avatar"]
  patterns: [in-place auth dialog preserving canvas state, guest-first anonymous auto-minting, Bearer JWT token injection in API requests]

key-files:
  created:
    - apps/web/lib/auth.ts
    - apps/web/lib/auth-client.ts
    - apps/web/app/api/auth/[...all]/route.ts
    - apps/web/app/providers.tsx
    - apps/web/components/auth/auth-modal.tsx
    - apps/web/components/auth/user-button.tsx
    - apps/web/tests/auth/auth-server.test.ts
    - apps/web/tests/auth/anonymous-session.test.ts
    - apps/web/tests/components/header-bar-auth.test.tsx
  modified:
    - apps/web/package.json
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - apps/web/app/globals.css
    - apps/web/components/navigation/header-bar.tsx
    - apps/web/tests/header.test.tsx
    - apps/web/tests/page-integration.test.tsx

key-decisions:
  - "Configured Better Auth with synchronous SQLite schema pre-creation to eliminate runtime migration mismatches and warnings"
  - "Configured HS256 JWT signing in Better Auth jwt plugin with 15m expiration, userId, and isAnonymous claims"
  - "Used in-place Radix Dialog with backdrop-blur for AuthModal to prevent route unmounting or Cytoscape canvas reset"
  - "Positioned HeaderBar identity cluster directly to the right of ContributorPicker per D-02"
  - "Included Authorization: Bearer <jwt> on all /api/briefing requests in apps/web/app/page.tsx"

patterns-established:
  - "Guest-first navigation: First-time visitors automatically mint an anonymous session without forced logins or canvas resets"
  - "Token retrieval: Components access gateway bearer tokens via useAuth().getToken()"

requirements-completed:
  - AUTH-01
  - AUTH-02

coverage:
  - id: D1
    description: "Better Auth server configured with GitHub OAuth, anonymous plugin, and HS256 JWT issuance"
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "apps/web/tests/auth/auth-server.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Global AuthProvider managing session state, guest auto-minting, and getToken() Bearer retrieval"
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: "apps/web/tests/auth/anonymous-session.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "In-place AuthModal dialog and HeaderBar identity cluster with guest indicator and avatar popover"
    requirement: AUTH-01
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/components/header-bar-auth.test.tsx"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-16
status: complete
---

# Phase 6: Plan 01 Summary

**Better Auth integration with GitHub OAuth, anonymous guest session auto-minting, HS256 JWT issuance, in-place AuthModal dialog, and HeaderBar identity cluster**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-16T09:01:56Z
- **Completed:** 2026-10-16T09:22:00Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Configured Better Auth in `apps/web` with SQLite database engine, GitHub OAuth provider, `anonymous()` guest plugin, and `jwt()` plugin issuing HS256 signed JWTs with 15-minute expiration and `{ userId, isAnonymous }` claims.
- Implemented global `AuthProvider` in `apps/web/app/providers.tsx` handling session hydration, automatic guest session minting without forced login walls, and Bearer token retrieval via `getToken()`.
- Built `AuthModal` dialog in `apps/web/components/auth/auth-modal.tsx` with Radix Dialog, providing in-place GitHub OAuth sign-in without unmounting the active Cytoscape graph canvas.
- Built `UserButton` dropdown popover in `apps/web/components/auth/user-button.tsx` with user handle `@login`, avatar image, verified status, workspace count, switch account, and sign out actions.
- Integrated the identity cluster into `HeaderBar` immediately to the right of `ContributorPicker` (D-02), presenting subtle "Guest" indicator pill and "Sign In" button when unauthenticated, switching to `UserButton` when authenticated.
- Injected Bearer token retrieval into `/api/briefing` API calls in `apps/web/app/page.tsx`.
- All 14 test suites and 56 tests in `apps/web` pass, with complete type safety verified by TypeScript.

## Task Commits

Each task was committed atomically:

1. **Task 06-01-01: Install Better Auth dependencies and configure Better Auth server and client** - `f5c8390` (feat)
2. **Task 06-01-02: Implement global AuthProvider and anonymous guest auto-minting** - `9258fbd` (feat)
3. **Task 06-01-03: Build AuthModal, UserButton popover, and integrate HeaderBar identity cluster** - `5773bee` (feat)

## Files Created/Modified

- `apps/web/lib/auth.ts`: Better Auth server configuration with SQLite, GitHub OAuth, anonymous, and jwt plugins.
- `apps/web/lib/auth-client.ts`: Better Auth client using `better-auth/react` with anonymous and jwt client plugins.
- `apps/web/app/api/auth/[...all]/route.ts`: Next.js App Router route handler for Better Auth API routes.
- `apps/web/app/providers.tsx`: Global `AuthProvider` and `useAuth()` hook.
- `apps/web/app/layout.tsx`: Root layout wrapping tree in `<AuthProvider>`.
- `apps/web/app/globals.css`: Bridged shadcn CSS variable tokens with Argon 2077 cyberpunk palette.
- `apps/web/components/auth/auth-modal.tsx`: In-place modal dialog presenting GitHub OAuth CTA and cyberpunk styling.
- `apps/web/components/auth/user-button.tsx`: User avatar popover menu with profile metadata, switch account, and sign-out.
- `apps/web/components/navigation/header-bar.tsx`: HeaderBar updated with identity cluster positioned right of ContributorPicker.
- `apps/web/app/page.tsx`: Injected Authorization Bearer token header in API briefing requests.
- `apps/web/tests/auth/auth-server.test.ts`: Server test verifying Better Auth configuration and HS256 JWT signing.
- `apps/web/tests/auth/anonymous-session.test.ts`: Unit test verifying anonymous guest session minting and token retrieval.
- `apps/web/tests/components/header-bar-auth.test.tsx`: Component test verifying HeaderBar identity cluster states and modal triggers.

## Decisions Made

- Pre-created Better Auth SQLite schema tables and indices in `apps/web/lib/auth.ts` to prevent runtime schema mismatch warnings during cold starts.
- Enforced strict HS256 algorithm signing and verification with shared `BETTER_AUTH_SECRET`.
- Used in-place Radix Dialog with backdrop blur (`#090a0f/85 backdrop-blur-sm`) to preserve active Cytoscape graph canvas state and briefing history across authentication state changes.
- Positioned identity cluster immediately to the right of `ContributorPicker` conforming to Decision D-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug Fix] Replaced missing lucide-react Github icon with inline SVG**
- **Found during:** Task 06-01-03 (Building AuthModal)
- **Issue:** `lucide-react` does not export brand icon `Github`, causing runtime React element resolution error in test.
- **Fix:** Implemented crisp inline `GithubIcon` SVG component adhering to 24x24 viewBox.
- **Files modified:** `apps/web/components/auth/auth-modal.tsx`
- **Verification:** `tests/components/header-bar-auth.test.tsx` passed with 0 errors.
- **Committed in:** `5773bee`

**2. [Rule 2 - Test Compatibility] Wrapped tests in AuthProvider**
- **Found during:** Task 06-01-03 (Running full test suite)
- **Issue:** Existing tests in `tests/header.test.tsx` and `tests/page-integration.test.tsx` rendered `HeaderBar` and `HomePage` without `AuthProvider`.
- **Fix:** Wrapped test render targets in `<AuthProvider>`.
- **Files modified:** `apps/web/tests/header.test.tsx`, `apps/web/tests/page-integration.test.tsx`
- **Verification:** All 14 test suites and 56 tests passed.
- **Committed in:** `5773bee`

## User Setup Required

None - default environment variable fallbacks are in place for development (`BETTER_AUTH_SECRET`, `AUTH_DB_PATH`). For production, configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

## Next Phase Readiness

Plan 06-01 is complete. Ready for Plan 06-02 (FalkorDB openCypher schema extension with `(:User)`, `(:Organization)`, `[:ACCESSES]` relationships, and access migration queries).
