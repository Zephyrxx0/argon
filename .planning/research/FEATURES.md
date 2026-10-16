# Feature Research: Milestone v2.0

**Domain:** Authenticated Project Memory & Real-Time Sync  
**Researched:** 2026-10-16  
**Confidence:** HIGH  

## Feature Categories & Scoping

### 1. Authentication & Identity (`AUTH-01`)

**Must have (table stakes):**
- **GitHub App OAuth Login:** Standard NextAuth v5 GitHub sign-in button in HeaderBar with user avatar and sign-out menu.
- **Stateless Secure JWT Session:** HTTP-only, SameSite cookie storing user ID (`github_id`), handle, name, and avatar.
- **Guest Mode Preservation:** First-class unauthenticated experience. Guests can freely inspect showcase graphs (`ember-adr-showcase`, `argo-cd`) and trigger read-only briefings without prompt or blocker.
- **Guest Ingestion:** Guests can clone public repositories anonymously into ephemeral guest workspaces.

**Should have (differentiators):**
- **Automatic Person Linking:** Link authenticated GitHub user identity to mined `(:Person)` nodes in the repository's commit graph.
- **Workspace Claiming:** Prompt guest upon login to claim any guest-created workspaces created during the current browser session.

**Anti-features / What NOT to build:**
- Username/password registration (pure GitHub OAuth only).
- Social logins beyond GitHub (Google, Twitter, etc. make no sense for a developer git graph tool).

---

### 2. Multi-Tenant Graph Authorization (`AUTH-02`)

**Must have (table stakes):**
- **FalkorDB Graph Tenant Schema:**
  - `(:User {id: $githubId, login: $login, avatar_url: $avatar})`
  - `(:Organization {id: $orgId, login: $orgLogin})`
  - `(:User)-[:ACCESSES]->(:Workspace)`
  - `(:User)-[:OWNS]->(:Workspace)`
- **Fail-Closed Gateway Verification:**
  - Every request to `POST /api/v1/:workspaceId/query/:query` and `/api/v1/:workspaceId/briefing` verifies that the requesting identity has access.
  - If workspace is public (`w.is_public = true`), guests and all users are granted read access.
  - If workspace is private (`w.is_public = false`), gateway rejects requests with 403 Forbidden unless an `[:ACCESSES]` edge exists between the authenticated user and the workspace.

**Should have (differentiators):**
- Organization-level tenancy: Support team access where members of an organization automatically inherit access to company repositories.

---

### 3. Authenticated Ingestion & Secret Redaction (`ING-04`)

**Must have (table stakes):**
- **Private Repository Ingestion:**
  - Ephemeral shallow git clone using 1-hour GitHub App installation tokens (`https://x-access-token:<token>@github.com/<owner>/<repo>.git`).
- **Strict Token Redaction Middleware:**
  - Regex sanitization ensuring installation tokens and secrets are stripped from git stdout/stderr, FalkorDB `(:IngestJob)` error properties, and application logs.
- **Searchable Repository Picker:**
  - Modal dropdown querying user installations (`GET /user/installations` & `GET /installation/repositories`) so users can click a repo rather than pasting raw URLs.

**Should have (differentiators):**
- Clear visual badges distinguishing Public vs Private repositories in the UI.

---

### 4. Webhook Receiver & Incremental Sync (`SYNC-01`)

**Must have (table stakes):**
- **Webhook Endpoint with HMAC Verification:**
  - `POST /api/v1/webhooks/github` in `apps/gateway` verifying `X-Hub-Signature-256` using timing-safe comparison (`crypto.timingSafeEqual`).
- **Push Event Processing:**
  - Extract commit hashes and modified file lists from webhook payload.
  - Incrementally create `(:Commit)` nodes, update `(:File)` nodes and `[:TOUCHES]` edges, and recalculate co-change coupling.
- **Pull Request (Merged) Processing:**
  - Detect merged PRs.
  - Check for reverted PRs or newly introduced ADR/RFC markdown files.
  - Advance temporal validity windows (`valid_to` timestamps) on superseded decisions without requiring a full re-clone.

**Should have (differentiators):**
- **Live Canvas Pulse:** Frontend notification or Cytoscape node pulse when an incremental webhook event updates the active workspace graph.
