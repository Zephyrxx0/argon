# Pitfalls Research: Milestone v2.0

**Domain:** Authentication, Webhooks & Multi-Tenant Graph Security  
**Researched:** 2026-10-16  
**Confidence:** HIGH  

## Critical Pitfalls & Mitigation Strategies

### Pitfall 1: Breaking Guest Mode via Auth Middleware
- **Risk:** Developers often configure NextAuth middleware (`auth.ts` or `middleware.ts`) with blanket redirect rules that redirect all unauthenticated visitors to `/api/auth/signin`. This completely breaks Argon's core guest-first value proposition (Hackathon demo judges exploring without a GitHub login).
- **Warning Signs:** Navigating to `/` triggers a 307 redirect to GitHub OAuth.
- **Mitigation:** Do NOT use blanket auth redirects in Next.js middleware. Treat unauthenticated requests as valid Guest sessions. Guard only private workspace routes or private repository clone actions.

### Pitfall 2: Token Leakage in Git Subprocess Logs
- **Risk:** Authenticated git shallow clones use `https://x-access-token:<TOKEN>@github.com/...`. When Git encounters a network error or git command fails, it echoes the full remote URL (including the token) to `stderr`. If `stderr` is stored in FalkorDB `(:IngestJob.error)` or printed to server logs, the token leaks.
- **Warning Signs:** Server logs or database error nodes containing `ghs_...` or `x-access-token`.
- **Mitigation:**
  1. Implement a mandatory sanitization function: `text.replace(/x-access-token:[^@]+@/g, 'x-access-token:[REDACTED]@')` wrapped around every stdout/stderr handler in `packages/ingest`.
  2. Use Git's `GIT_ASKPASS` or credential helper if possible to avoid embedding the token in the URL string altogether.

### Pitfall 3: Webhook HMAC Timing Attacks
- **Risk:** Comparing `X-Hub-Signature-256` using standard string equality (`===`) is vulnerable to timing analysis attacks, allowing attackers to forge webhook payloads and poison the project graph.
- **Warning Signs:** Code using `if (computedSig === headerSig)`.
- **Mitigation:** Always use `crypto.timingSafeEqual(Buffer.from(computedSig), Buffer.from(headerSig))`. Verify that buffer lengths match before comparing, or pad to constant length.

### Pitfall 4: Incremental Sync Branch Drift & Out-of-Order Webhooks
- **Risk:** Webhooks can arrive out of order, or repositories can undergo force-pushes (`git push -f`) or rebases, causing incremental commit chains in FalkorDB to diverge or orphan nodes.
- **Warning Signs:** Missing intermediate commit nodes or broken parent-child commit traversals.
- **Mitigation:**
  - In `push` webhook handler, check if the `before` commit hash exists in the graph.
  - If `forced: true` or `before` commit is missing, flag the workspace for a background shallow re-sync rather than crashing or corrupting the graph.

### Pitfall 5: Cross-Tenant Data Leakage in Gateway Named Queries
- **Risk:** A client queries `/api/v1/:workspaceId/query/resolve_scope` with a private `:workspaceId` belonging to another user. If the gateway only checks if the bearer token is valid without verifying tenant ownership in the graph, unauthorized users can read private repository graphs.
- **Warning Signs:** Any endpoint accepting `:workspaceId` without matching against `[:ACCESSES]` edge.
- **Mitigation:**
  - Create `09_check_workspace_access.cypher`. Gateway executes this check on FalkorDB before running any requested named query. If check returns false and workspace is not public, return `403 Forbidden` immediately.

