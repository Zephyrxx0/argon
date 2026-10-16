# Architecture Research: Milestone v2.0

**Domain:** Multi-Tenant Architecture & Webhook Data Flow  
**Researched:** 2026-10-16  
**Confidence:** HIGH  

## System Topology & Boundaries

```
[ Developer Browser / Client ]
             │
             ├── (1) Browse / Public Showcase (Guest: No Cookie, w.is_public=true)
             ├── (2) OAuth Sign-in -> /api/auth/callback/github (NextAuth v5 JWT)
             │
             ▼
     [ apps/web (Next.js 15) ]
             │
             ├── Authenticated JWT Session
             ├── Octokit App Token Exchange (for Private Repos)
             │
             ├── Gateway Query Request (Bearer Token + X-User-Id header or Signed JWT)
             ▼
    [ apps/gateway (Hono on Cloud Run) ] ◄── (3) GitHub Webhook (Push / PR Merged)
             │                                   (HMAC-SHA256 Signed)
             ├── Middleware: Tenant Access Check
             │   MATCH (u:User {id: $userId})-[:ACCESSES]->(w:Workspace {id: $wsId})
             │   OR WHERE w.is_public = true
             │
             ▼
    [ FalkorDB (Compute Engine) ]
    ├── (:User), (:Organization), (:Workspace)
    ├── (:Commit), (:File), (:Person), (:Decision)
    └── (:IngestJob)
```

---

## Component Responsibilities

### 1. `apps/web` (Next.js 15 App Router)
- **Auth Layer:**
  - `auth.ts`: Configures `NextAuth` with GitHub Provider and `strategy: "jwt"`.
  - `components/auth/session-provider.tsx`: `"use client"` wrapper around NextAuth's `SessionProvider`.
  - `components/navigation/header-bar.tsx`: Displays user avatar, login/logout controls, or "GUEST // 2077" badge.
- **Repository Selector:**
  - `components/workspace/repo-picker-modal.tsx`: Queries authorized GitHub App installations for available private/public repos.

### 2. `apps/gateway` (Hono Server)
- **Webhook Route (`POST /api/v1/webhooks/github`):**
  - Reads raw request body.
  - Verifies `X-Hub-Signature-256` header using `crypto.timingSafeEqual`.
  - Dispatches `push` and `pull_request` jobs to FalkorDB `(:IngestJob)` or executes fast incremental updates.
- **Tenant Authorization Gate:**
  - Verifies that private workspaces can only be read/queried by users with an active `[:ACCESSES]` edge in FalkorDB.

### 3. `packages/graph` (openCypher Schema & Queries)
- **New Named Queries:**
  - `09_check_workspace_access.cypher`: Checks if `$userId` has `[:ACCESSES]` to `$workspaceId` or if workspace is public.
  - `10_link_user_workspace.cypher`: Creates `(:User)` node if not exists and links `[:ACCESSES]` / `[:OWNS]` to `(:Workspace)`.
  - `11_incremental_push_update.cypher`: Updates modified files and co-change coupling from webhook payload.
  - `12_advance_adr_validity.cypher`: Advances `valid_to` timestamps for superseded decisions.

### 4. `packages/ingest` (Ingestion Engine)
- **App Installation Token Handler:**
  - Signs RS256 JWT using GitHub App Private Key and requests short-lived installation access tokens via Octokit.
- **Secret Redaction Middleware:**
  - Wraps all Git spawn calls (`git clone`, `git fetch`, `git log`) with an output filter that redacts `x-access-token:[^@]+@` before logging or emitting errors.

---

## Data Flow: Webhook Incremental Sync

1. GitHub fires a `push` webhook containing commit SHA, author, and list of added/modified/removed files.
2. Gateway receives `POST /api/v1/webhooks/github` and validates HMAC signature against `GITHUB_WEBHOOK_SECRET`.
3. Gateway identifies target `:Workspace` by repository full name (`owner/repo`).
4. Gateway executes `11_incremental_push_update.cypher`:
   - Creates `(:Commit {id: commit_sha, ...})`
   - Creates/links `(:Person)` author node
   - Creates `[:TOUCHES]` edges to `(:File)` nodes
   - Recalculates co-change coupling for modified file pairs
5. If the commit contains modifications in ADR/RFC paths (`docs/adr/*.md`), gateway parses frontmatter/supersession headers and calls `12_advance_adr_validity.cypher` to update temporal validity without full clone.

