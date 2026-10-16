# Stack Research: Milestone v2.0

**Domain:** Authentication, Multi-Tenant Graph Authorization & Webhook Ingestion  
**Researched:** 2026-10-16  
**Confidence:** HIGH  

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `next-auth` (Auth.js) | `^5.0.0-beta.25` | GitHub App OAuth & Session Management in `apps/web` | Battle-tested JWT session strategy requires zero database adapters (preserving FalkorDB as sole datastore), native Next.js 15 App Router & React 19 compatibility. |
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

## Guest User Architecture & Evaluation

A critical requirement for Argon is supporting **Guest Users** alongside authenticated GitHub users.

### Evaluation of Options:

1. **Option A: NextAuth v5 (Dual-Mode: Null Session as Guest) [RECOMMENDED]**
   - **How it works:** When a visitor lands on Argon, `session` is `null`. They are seamlessly treated as a Guest. All public showcase workspaces (`ember-adr-showcase`, `argo-cd`, etc.) are flagged with `is_public: true` or `owner: null` and require no authentication. If a guest wants to ingest an ephemeral public repo, they can do so under a guest workspace ID. When they click "Connect GitHub", NextAuth signs them in, binds their GitHub identity, and grants access to their private repositories.
   - **Database impact:** Zero database overhead. No adapter needed.
   - **DX:** Standard Next.js idiom; zero latency on landing page.

2. **Option B: NextAuth v5 with Custom Anonymous Credentials Provider**
   - **How it works:** A custom `CredentialsProvider({ id: "anonymous", ... })` generates an ephemeral JWT session for anonymous guests upon clicking "Continue as Guest".
   - **Tradeoff:** Adds cookie state and client redirect overhead for guests who simply want to read showcase graphs.

3. **Option C: Better Auth with `anonymous()` plugin**
   - **How it works:** Better Auth has a dedicated `anonymous()` plugin that automatically converts guest accounts into authenticated users on OAuth sign-in.
   - **Why NOT chosen:** Better Auth strictly requires a relational SQL database adapter (Prisma, Drizzle, Kysely for Postgres/MySQL/SQLite) or MongoDB adapter. Argon has a hard project constraint: **FalkorDB is the primary and only database (no secondary Postgres/Firestore/Mongo datastore)**. Implementing and maintaining a full openCypher database adapter for Better Auth is outside project scope.

4. **Option D: Custom Session Handling (`jose` + Next.js Route Handlers)**
   - **How it works:** Manual GitHub OAuth handshake and custom signed JWT cookies.
   - **Tradeoff:** Requires custom CSRF state tokens, PKCE, and cookie rotation logic that NextAuth v5 already provides securely.

---

## Installation

```bash
# In apps/web
pnpm --filter web add next-auth@beta @octokit/auth-app @octokit/rest

# In apps/gateway
pnpm --filter @argon/gateway add jose

# In packages/ingest
pnpm --filter @argon/ingest add @octokit/auth-app
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| NextAuth v5 (Auth.js) | Better Auth | If the project already uses PostgreSQL or MySQL with Prisma/Drizzle. |
| Dual-Mode (Null as Guest) | Forced Anonymous Session | If server-side cart/draft state must be stored across distinct subdomains before login. |
| Octokit Auth App | Raw `fetch` + `crypto` RS256 | If zero-dependency binary size is critical (Octokit handles token caching and refresh automatically). |

---

## What NOT to Use

- **Do NOT use Prisma / Drizzle / PostgreSQL**: Argon relies strictly on FalkorDB. NextAuth must be used in stateless JWT mode (`session: { strategy: "jwt" }`).
- **Do NOT use Lucia Auth**: Lucia is officially deprecated.
- **Do NOT store GitHub App private keys or installation tokens in FalkorDB**: Private keys live strictly in environment variables; installation tokens are ephemeral and generated on demand in memory.

