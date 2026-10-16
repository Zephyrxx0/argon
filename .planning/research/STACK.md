# Stack Research: Milestone v2.0

**Domain:** Authentication, Multi-Tenant Graph Authorization & Webhook Ingestion  
**Researched:** 2026-10-16 (Updated for Better Auth)  
**Confidence:** HIGH  

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `better-auth` | `^1.1.0` | GitHub OAuth & Stateless Guest Session Management in `apps/web` | Official modern TypeScript-first auth framework with first-class `anonymous()` plugin, full Next.js 15 & React 19 support, and stateless cookie operation (`storeStateStrategy: "cookie"`, `storeAccountCookie: true`) without requiring an external database adapter (preserving FalkorDB as sole datastore). |
| `@octokit/auth-app` | `^7.1.0` | GitHub App Installation Token Generation | Official Octokit library for signing RS256 JWTs and obtaining short-lived (1-hour) installation access tokens (`ghs_...`) for private repository ingestion. |
| `@octokit/rest` | `^21.0.0` | GitHub REST API Client | Lightweight client for querying user installations (`GET /user/installations`) and accessible repositories (`GET /installation/repositories`). |
| Node.js `crypto` | Built-in | Webhook HMAC-SHA256 Signature Verification | Native, zero-dependency `crypto.createHmac` + `crypto.timingSafeEqual` prevents timing attack vulnerabilities on GitHub webhooks. |
| FalkorDB openCypher | Current (`v0.1`) | Multi-Tenant Authorization Model | Enforces tenant boundaries natively via graph edges `(:User)-[:ACCESSES]->(:Workspace)` without an external RDBMS. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jose` | `^5.9.6` | Gateway Tenant JWT Verification | Lightweight edge/Node.js JWT signing & verification for stateless authorization claims between `apps/web` and `apps/gateway`. |
| `zod` | `^3.24.2` | Webhook & Session Payload Validation | Validating incoming GitHub webhook payload schemas (`push`, `pull_request`). |

---

## Guest User Architecture & Better Auth Evaluation

A critical requirement for Argon is supporting **Guest Users** alongside authenticated GitHub users.

### Selected Architecture: Better Auth with `anonymous()` in Stateless Cookie Mode

- **How it works:** 
  1. `betterAuth()` is initialized **without a database adapter**.
  2. `storeStateStrategy: "cookie"` stores OAuth state payloads in encrypted cookies.
  3. `storeAccountCookie: true` stores provider token and profile data in encrypted cookies.
  4. The `anonymous()` plugin (`better-auth/plugins`) provides native guest sessions. Guests can click "Continue as Guest" or automatically browse with an anonymous ID via `authClient.signIn.anonymous()`.
  5. When a guest user decides to log in via GitHub, Better Auth's `onLinkAccount` callback automatically links their temporary session to their authenticated GitHub account.
- **Database impact:** Zero database overhead. Does not require Prisma, Drizzle, or PostgreSQL, strictly honoring our rule that FalkorDB is the sole datastore.
- **Next.js 15 / React 19:** Clean client hooks (`useSession()`, `authClient.signIn.social({ provider: "github" })`) with zero React 19 hydration issues.

---

## Installation

```bash
# In apps/web
pnpm --filter web add better-auth @octokit/auth-app @octokit/rest

# In apps/gateway
pnpm --filter @argon/gateway add jose

# In packages/ingest
pnpm --filter @argon/ingest add @octokit/auth-app
```

---

## Alternatives Considered

| Recommended | Alternative | Why Better Auth Was Chosen |
|-------------|-------------|----------------------------|
| Better Auth (Stateless + Anonymous plugin) | NextAuth (Auth.js v5) | NextAuth v5 lacks a native anonymous user plugin and is still in beta with React 19 hydration friction. The Better Auth team maintains Auth.js as well, but Better Auth offers cleaner TypeScript DX and out-of-the-box guest account linking. |
| Stateless Cookie Cache | Prisma / PostgreSQL Adapter | Argon's core constraint requires FalkorDB as the only database. Stateless cookie sessions eliminate RDBMS dependencies entirely. |

---

## What NOT to Use

- **Do NOT use Prisma / Drizzle / PostgreSQL**: Argon relies strictly on FalkorDB. Better Auth must be configured in stateless mode.
- **Do NOT store GitHub App private keys or installation tokens in FalkorDB**: Private keys live strictly in environment variables; installation tokens are ephemeral and generated on demand in memory.
