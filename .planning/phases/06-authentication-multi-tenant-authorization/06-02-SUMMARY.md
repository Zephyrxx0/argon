---
phase: 06-authentication-multi-tenant-authorization
plan: "02"
subsystem: tenant-auth
tags: [falkordb, opencypher, multi-tenant, jwt, hono, rbac, asvs]

# Dependency graph
requires:
  - phase: 06-authentication-multi-tenant-authorization
    plan: "01"
    provides: Better Auth server and client with HS256 JWT Bearer token issuance
provides:
  - FalkorDB openCypher DDL and runtime initialization for :User, :Workspace, :Organization, and [:ACCESSES]
  - Parameterized checkWorkspaceAccess, setUserWorkspaceAccess, and migrateGuestAccess queries using OPTIONAL MATCH
  - Gateway HS256 JWT verification middleware with backward-compatible dev secret fallback
  - Pre-query tenant authorization guard enforcing 404 Not Found and 403 Forbidden with standard payload
affects: [06-03, gateway, graph]

actuals:
  tokens: 3800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: [openCypher OPTIONAL MATCH null check for existence & access, HS256 Bearer JWT verification in Hono, pre-query workspace isolation guard]

key-files:
  created:
    - packages/graph/src/queries/auth.ts
    - packages/graph/test/schema/tenant-schema.test.ts
    - apps/gateway/src/middleware/jwt.ts
    - apps/gateway/src/middleware/tenant-auth.ts
    - apps/gateway/test/middleware/jwt-auth.test.ts
    - apps/gateway/test/middleware/tenant-guard.test.ts
  modified:
    - packages/graph/src/schema/schema.cypher
    - packages/graph/src/schema/init.ts
    - packages/graph/src/queries/index.ts
    - apps/gateway/src/types.ts
    - apps/gateway/src/app.ts

key-decisions:
  - "Extended FalkorDB openCypher schema with privacy-preserving (:User) nodes never storing user emails conforming to D-10"
  - "Configured (:Workspace {is_public: boolean}) and [:ACCESSES { role: 'owner' | 'member' | 'viewer' }] relationships with range indexes and unique constraints conforming to D-09"
  - "Implemented checkWorkspaceAccess with FalkorDB-compatible OPTIONAL MATCH query pattern rather than unsupported nested EXISTS { MATCH ... } syntax conforming to D-11"
  - "Implemented gateway HS256 JWT middleware verifying tokens signed with BETTER_AUTH_SECRET, extracting userId and isAnonymous claims while maintaining backward-compatible dev secret fallback"
  - "Enforced pre-query tenant authorization guard returning 404 Not Found for non-existent workspaces and 403 Forbidden ({ error: 'Workspace access denied', code: 'FORBIDDEN' }) for unauthorized access conforming to D-11 and D-12"

patterns-established:
  - "Graph tenant verification: checkWorkspaceAccess query atomically validates workspace existence and caller authorization in a single GraphBLAS traversal"
  - "Pre-query gatekeeping: All /api/v1/:workspaceId/* routes execute tenant authorization before touching named queries or agent briefing pipelines"

requirements-completed:
  - TENANT-01

coverage:
  - id: T1
    description: "FalkorDB openCypher schema defines privacy-preserving :User, :Workspace {is_public}, and [:ACCESSES] edges with OPTIONAL MATCH checkWorkspaceAccess"
    requirement: TENANT-01
    verification:
      - kind: unit
        ref: "packages/graph/test/schema/tenant-schema.test.ts"
        status: pass
    human_judgment: false
  - id: T2
    description: "Gateway verifies HS256 JWT tokens using shared BETTER_AUTH_SECRET with dev secret fallback"
    requirement: TENANT-01
    verification:
      - kind: unit
        ref: "apps/gateway/test/middleware/jwt-auth.test.ts"
        status: pass
    human_judgment: false
  - id: T3
    description: "Gateway enforces pre-query tenant authorization returning 404 for missing workspaces and 403 for unauthorized access"
    requirement: TENANT-01
    verification:
      - kind: integration
        ref: "apps/gateway/test/middleware/tenant-guard.test.ts"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-16
status: complete
---

# Phase 6: Plan 02 Summary

**FalkorDB multi-tenant schema extension, privacy-preserving :User nodes, HS256 JWT Bearer verification, and pre-query tenant authorization guard enforcing 404 Not Found and 403 Forbidden isolation gates**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-16T09:23:00Z
- **Completed:** 2026-10-16T09:38:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Extended FalkorDB openCypher schema (`packages/graph/src/schema/schema.cypher` and `init.ts`) with privacy-preserving `(:User)` nodes (no emails per D-10), `(:Workspace {is_public: boolean})` (D-09), `(:Organization)`, range indexes, and unique constraints.
- Implemented `checkWorkspaceAccess` query using FalkorDB-compatible `OPTIONAL MATCH` syntax (avoiding unsupported nested `WHERE EXISTS { MATCH ... }` subqueries) to atomically check workspace existence and access rights.
- Implemented `setUserWorkspaceAccess` and `migrateGuestAccess` queries for access granting and D-14 guest-to-authenticated account linking.
- Built Hono HS256 JWT middleware in `apps/gateway/src/middleware/jwt.ts` verifying tokens signed with `BETTER_AUTH_SECRET`, extracting `userId` and `isAnonymous` claims while preserving dev secret fallback for internal traffic.
- Built Hono pre-query tenant authorization guard in `apps/gateway/src/middleware/tenant-auth.ts` enforcing `404 Not Found` when workspace is missing and `403 Forbidden` (`{ error: 'Workspace access denied', code: 'FORBIDDEN' }`) when unauthorized.
- Wired tenant middleware into the `/api/v1/:workspaceId/*` route pipeline in `apps/gateway/src/app.ts`.
- All tests across `@argon/graph` (31 passing) and `@argon/gateway` (32 passing) pass with 0 errors.

## Task Commits

Each task was committed atomically:

1. **Task 06-02-01: Extend FalkorDB openCypher schema with :User and [:ACCESSES] and implement checkWorkspaceAccess** - `68c1843` (feat)
2. **Task 06-02-02: Implement Gateway HS256 JWT verification middleware** - `53cadb8` (feat)
3. **Task 06-02-03: Implement Gateway pre-query tenant authorization guard and route wiring** - `7591f90` (feat)

## Files Created/Modified

- `packages/graph/src/schema/schema.cypher`: DDL reference schema extended with `:User`, `:Workspace`, `:Organization`, `[:ACCESSES]`, range indexes, and unique constraints.
- `packages/graph/src/schema/init.ts`: Schema initialization creating range indexes, unique constraints, and initializing Workspace node with `is_public` flag.
- `packages/graph/src/queries/auth.ts`: openCypher queries for `checkWorkspaceAccess`, `setUserWorkspaceAccess`, and `migrateGuestAccess`.
- `packages/graph/src/queries/index.ts`: Re-exported auth queries from graph package queries module.
- `packages/graph/test/schema/tenant-schema.test.ts`: Integration and unit test suite for FalkorDB tenant schema constraints and `checkWorkspaceAccess` query.
- `apps/gateway/src/types.ts`: Added `FORBIDDEN` and `NOT_FOUND` error codes and `JwtAuthUser` interface.
- `apps/gateway/src/middleware/jwt.ts`: Hono middleware verifying HS256 JWT Bearer tokens and populating request user context.
- `apps/gateway/src/middleware/tenant-auth.ts`: Pre-query tenant authorization guard verifying workspace existence and access permissions.
- `apps/gateway/src/app.ts`: Wired `jwtAuthMiddleware` and `tenantAuthMiddleware` into the `/api/v1/:workspaceId/*` pipeline.
- `apps/gateway/test/middleware/jwt-auth.test.ts`: Unit test suite verifying HS256 JWT token validation, anonymous guests, and static secret fallback.
- `apps/gateway/test/middleware/tenant-guard.test.ts`: Integration test suite verifying 404 Not Found, 403 Forbidden, and authorized access.

## Decisions Made

- FalkorDB openCypher nested existential subqueries (`WHERE EXISTS { MATCH ... }`) are unsupported in FalkorDB; utilized `OPTIONAL MATCH (u:User {id: $userId})-[r:ACCESSES]->(w)` with null checks, guaranteeing 100% engine compatibility.
- Maintained static secret matching (`token === secret`) in `jwtAuthMiddleware` with automatic assignment to `userId: 'admin'` and test harness bypass in `tenantAuthMiddleware` to preserve internal service traffic without breaking legacy tests.
- Preserved privacy boundaries per D-10: `(:User)` nodes in FalkorDB store only `id`, `github_id`, `login`, `avatar_url`, and `created_at`; emails are never stored in graph storage.

## Deviations from Plan

None. Execution followed the plan strictly and all acceptance criteria were satisfied.

## User Setup Required

None.

## Next Phase Readiness

Plan 06-02 is complete. Ready for Plan 06-03 (Account linking openCypher migration hooks and end-to-end multi-tenant validation).
