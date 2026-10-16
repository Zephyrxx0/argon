# Phase 7: Authenticated Ingestion & Private Repo Selector - Research

**Date:** 2026-10-16  
**Status:** Complete  

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `apps/gateway` service holds the GitHub App Private Key and mints short-lived installation access tokens on demand using `@octokit/auth-app`, keeping GitHub App secrets isolated within the backend service boundary and out of web client bundles.
- **D-02:** Installation tokens are cached in-memory in Gateway using a TTL cache keyed by `installationId` with a 5-minute pre-expiry safety buffer (up to 55 minutes validity), preventing redundant token minting roundtrips.
- **D-03:** `packages/ingest` receives installation tokens in-memory via `CloneOptions` / `IngestConfig` (`installationToken?: string`) passed directly by callers; tokens are never accepted or exposed via CLI flags, environment variables, or disk files.
- **D-04:** Dual authorization verification: Gateway checks that the authenticated user (`userId` / GitHub identity) is an authorized member/collaborator of the GitHub App installation before granting repository clone tokens.
- **D-05:** Git authentication uses `http.extraheader` injection: Pass `Authorization: basic <base64(x-access-token:TOKEN)>` via git configuration arguments (`-c http.extraheader=...`), keeping remote URLs clean (`https://github.com/org/repo`) on disk, in `.git/config`, and in `git remote -v`.
- **D-06:** Centralized `redactSecrets` utility in `packages/ingest` with strict GitHub token regexes (`ghs_[A-Za-z0-9_]+`, `ghp_[A-Za-z0-9_]+`, `Bearer [A-Za-z0-9_.-]+`, `x-access-token:[^@]+@`) applied systematically across all loggers, thrown error objects, and FalkorDB `(:IngestJob.error)` properties.
- **D-07:** Authentication failures (401/403 from GitHub) return structured sanitized error codes (`AUTH_FAILED_EXPIRED_OR_REVOKED`) with clear remediation guidance, preventing raw subprocess stack traces or leaked request headers from reaching users or logs.
- **D-08:** Rigorous canary secret leak tests in Vitest: Integration tests inject synthetic canary tokens (`ghs_canary_secret_xyz`) into simulated clone errors and stdout/stderr streams, asserting zero leakage across all error strings, logs, and database records.
- **D-09:** `IngestModal` features a tabbed interface with 'Your Repositories' tab (for authenticated users, fetching authorized repos from GitHub App installations with Lock/Globe badges) and 'Public URL' tab (direct HTTPS URL for open source showcases).
- **D-10:** Repository items render as rich rows displaying `owner/repo`, Private/Public badge (with Lock/Globe icons), default branch badge (`main`/`master`), and organization avatar.
- **D-11:** Client-side fuzzy search and organization filter pills enable instant latency-free filtering over authorized repositories as the user types.
- **D-12:** Contextual empty states: Unauthenticated guests are prompted to 'Sign In with GitHub' (opening AuthModal), while users with 0 installations see an 'Install Argon GitHub App' link to `https://github.com/apps/<app-slug>/installations/new` with a 'Check Again' refresh button.
- **D-13:** Identity relationship in FalkorDB is modeled as an explicit `(:User)-[:IDENTIFIES]->(:Person)` edge, preserving immutable mined git topology while cleanly binding authenticated app accounts to repository contributors.
- **D-14:** Multi-factor identity matching: Links are formed by matching GitHub user primary/verified emails, GitHub noreply email patterns (`<id>+<login>@users.noreply.github.com` and `<login>@users.noreply.github.com`), or exact case-insensitive login/name match.
- **D-15:** Dual lifecycle trigger: Identity linking executes automatically at the conclusion of a repository ingestion run AND whenever a user signs in to link existing historical graph nodes.
- **D-16:** Visual verification pills: In `NodeInspector` and `ContributorPicker`, linked identities display verified GitHub profile avatars, links to `github.com/<login>`, and a distinctive 'You' badge for the active authenticated user.

### the agent's Discretion
- 150ms debounce for fuzzy search in repo selector.
- Exact fallback monogram icons when GitHub avatar images fail to load.
- Batching size for Cypher `IDENTIFIES` edge merges.

### Deferred Ideas
- Phase 8: GitHub webhook listener (`push`, `pull_request`) with HMAC verification and incremental sync.
- v3.0: Multi-user organization team spaces and RBAC.

---

## Standard Stack

| Layer | Library / Tool | Verified Version | Purpose |
|-------|----------------|------------------|---------|
| Backend / Auth | `@octokit/auth-app` | `^8.3.1` [VERIFIED: npm registry] | GitHub App JWT signing & installation token generation in Gateway |
| Backend / REST | `@octokit/rest` | `^22.0.1` [VERIFIED: npm registry] | Querying installations and user-authorized repositories |
| Ingestion / Git | `simple-git` | `^3.27.0` [VERIFIED: package.json:20] | Subprocess git clone with config argument injection |
| Frontend / UI | `@radix-ui/react-tabs` | `^1.1.3` [VERIFIED: npm registry] | Headless accessible tabs for IngestModal |
| Frontend / Icons | `lucide-react` | `^1.16.0` [VERIFIED: package.json:39] | Terminal & git icons (Lock, Globe, Search, RefreshCw, ShieldCheck, UserCheck) |
| Test Suite | `vitest` | `^3.2.0` [VERIFIED: package.json:28] | Unit, integration, and canary leak test execution |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@octokit/auth-app` | npm | 6 yrs | ~3.8M/wk | github.com/octokit/auth-app.js | [OK] | Approved |
| `@octokit/rest` | npm | 13 yrs | ~15M/wk | github.com/octokit/rest.js | [OK] | Approved |
| `@radix-ui/react-tabs` | npm | 4 yrs | ~6.5M/wk | github.com/radix-ui/primitives | [OK] | Approved |

---

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────────────────────────────┐
                │                  apps/web                    │
                │  IngestModal (Tabs: Repos / Public URL)      │
                │  NodeInspector & ContributorPicker [YOU]     │
                └───────────────────────┬──────────────────────┘
                                        │ JWT Bearer Auth
                                        ▼
                ┌──────────────────────────────────────────────┐
                │                 apps/gateway                 │
                │  /api/v1/github/repositories                 │
                │  /api/v1/workspaces/ingest                   │
                │  GitHubAppService (@octokit/auth-app)        │
                │  TTL Token Cache (55 min)                    │
                └───────────────┬──────────────────────────────┘
                                │ installationToken (in-memory)
                                ▼
                ┌──────────────────────────────────────────────┐
                │               packages/ingest                │
                │  cloneRepository()                           │
                │   -c http.extraheader="Authorization: Basic" │
                │  redactSecrets() sanitizer                   │
                │  Canary Leak Verification Tests              │
                └───────────────┬──────────────────────────────┘
                                │ openCypher
                                ▼
                ┌──────────────────────────────────────────────┐
                │                   FalkorDB                   │
                │  (:User)-[:IDENTIFIES]->(:Person)            │
                │  (:IngestJob { error: "[REDACTED]" })        │
                └──────────────────────────────────────────────┘
```

### Pattern 1: Git Header Authentication via `http.extraheader`
**What:** Pass credentials to Git through temporary runtime configuration flags rather than embedding tokens inside the repository URL.
**When to use:** Whenever cloning private repositories with short-lived GitHub App or OAuth tokens.
```typescript
// packages/ingest/src/git/clone.ts
const cloneArgs: string[] = ['--filter=blob:none'];
if (options.depth) cloneArgs.push(`--depth=${options.depth}`);
if (options.branch) cloneArgs.push(`--branch=${options.branch}`);

if (options.installationToken) {
  const credentials = Buffer.from(`x-access-token:${options.installationToken}`).toString('base64');
  // Inject via -c http.extraheader
  cloneArgs.unshift('-c', `http.extraheader=Authorization: Basic ${credentials}`);
}

// Target URL is clean and never stores secrets: https://github.com/owner/repo
await git.clone(cleanRepoUrl, targetDir, cloneArgs);
```

### Pattern 2: Multi-Layer Secret Redaction
**What:** Centralized string and error sanitizer stripping all GitHub and bearer tokens before log emission or database writes.
```typescript
// packages/ingest/src/git/redact.ts
const SECRET_PATTERNS = [
  /ghs_[A-Za-z0-9_]{20,}/g,
  /ghp_[A-Za-z0-9_]{20,}/g,
  /gho_[A-Za-z0-9_]{20,}/g,
  /ghu_[A-Za-z0-9_]{20,}/g,
  /ghr_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /Bearer\s+[A-Za-z0-9_.-]+/gi,
  /Basic\s+[A-Za-z0-9+/=]+/gi,
  /https:\/\/[^@\s]+@/g,
  /x-access-token:[^@\s]+@/g,
];

export function redactSecrets(input: string): string {
  if (!input) return input;
  let sanitized = input;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
}
```

### Pattern 3: openCypher User-to-Person Identity Graph Merging
**What:** Connects authenticated application `(:User)` nodes to immutable git commit `(:Person)` nodes using multi-criteria email and handle matching.
```cypher
MATCH (u:User {id: $userId})
MATCH (p:Person)
WHERE (p.email IS NOT NULL AND p.email IN $userEmails)
   OR p.email ENDS WITH ('+' + u.login + '@users.noreply.github.com')
   OR p.email = (u.login + '@users.noreply.github.com')
   OR toLower(p.name) = toLower(u.login)
MERGE (u)-[r:IDENTIFIES]->(p)
ON CREATE SET r.created_at = timestamp()
RETURN count(r) AS linked_count
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub App JWT & token generation | Custom JWT signing with `jsonwebtoken` | `@octokit/auth-app` | Handles expiration skew, token refresh, installation scope mapping, and GitHub API versioning |
| Accessible tab navigation in modal | Custom `<div>` state toggles | `@radix-ui/react-tabs` | Full keyboard navigation (ArrowLeft/Right, Home/End), ARIA roles (`tab`, `tabpanel`), and focus management |
| Git subprocess credentials | In-URL token injection (`https://token@...`) | `-c http.extraheader` | URL tokens persist in `.git/config` on disk and leak via `git remote -v` and process lists |

---

## Common Pitfalls

### Pitfall 1: Leaking Tokens via Git Remote Origin URL
- **What goes wrong:** Cloning with `https://x-access-token:TOKEN@github.com/...` writes the token directly to `.git/config` inside the cloned directory. Any debugging tool, directory archive, or error log examining remotes exposes the secret.
- **Why it happens:** Convenience of single-string URL cloning.
- **How to avoid:** Always use `-c http.extraheader=Authorization: Basic ...` with a clean remote URL (`https://github.com/owner/repo`).
- **Warning signs:** Any occurrence of `x-access-token` in `.git/config`.

### Pitfall 2: Token Expiration Mid-Ingestion
- **What goes wrong:** A repository clone or deep commit analysis fails with HTTP 401 halfway through processing.
- **Why it happens:** Using an installation token near the end of its 60-minute window.
- **How to avoid:** Gateway TTL cache deducts a 5-minute safety buffer (evicting at 55 minutes), guaranteeing that tokens minted for ingestion have at least 55 minutes of remaining lifetime.

### Pitfall 3: Re-Cloning Mismatched Author Identifiers
- **What goes wrong:** Author nodes duplicate or fail to link because git commit authors use secondary emails or GitHub noreply addresses (`12345+username@users.noreply.github.com`).
- **Why it happens:** Relying on strict equality between primary account email and git commit email.
- **How to avoid:** Multi-factor resolution checking verified emails list, noreply pattern suffixes, and case-insensitive username matching.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config files | `apps/gateway/vitest.config.ts`, `packages/ingest/vitest.config.ts`, `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @argon/ingest test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | Target Test File |
|--------|----------|-----------|-------------------|------------------|
| ING-04 | User queries authorized repositories & triggers clone with token | Integration | `pnpm --filter @argon/gateway test test/routes/github-repos.test.ts` | `apps/gateway/test/routes/github-repos.test.ts` |
| ING-05 | Ingestion scrubs all tokens from git stdout/stderr & IngestJob error properties | Unit / Leak | `pnpm --filter @argon/ingest test test/git/redact.test.ts` | `packages/ingest/test/git/redact.test.ts` |
| ING-05 | Canary secret leak prevention test | Integration | `pnpm --filter @argon/ingest test test/git/canary-leak.test.ts` | `packages/ingest/test/git/canary-leak.test.ts` |
| TENANT-02 | Link authenticated (:User) to mined (:Person) commit author nodes | Integration | `pnpm --filter @argon/ingest test test/writer/identity-linking.test.ts` | `packages/ingest/test/writer/identity-linking.test.ts` |
| TENANT-02 | Contributor picker and node inspector render verified & [YOU] badges | Component | `pnpm --filter web test tests/components/contributor-identity.test.tsx` | `apps/web/tests/components/contributor-identity.test.tsx` |
| ING-04 | IngestModal tabs, repo search filtering, and empty states | Component | `pnpm --filter web test tests/components/ingest-modal-picker.test.tsx` | `apps/web/tests/components/ingest-modal-picker.test.tsx` |

---

## Security Domain (ASVS Level 1)

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Short-lived GitHub App tokens (max 60 min) with in-memory TTL caching |
| V3 Session Management | yes | Better Auth JWT bearer verification in Gateway before granting repo list or clone |
| V4 Access Control | yes | Dual verification: user must belong to installation owning the repository |
| V5 Input Validation | yes | Zod schema validation for repository slugs and ingestion options |
| V6 Cryptography | yes | Timing-safe token comparison and base64 auth header encoding |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leak in git process output or .git/config | Information Disclosure | `http.extraheader` injection + regex `redactSecrets()` utility across all logs/errors |
| Cross-tenant private repository cloning | Elevation of Privilege | Gateway verifies user's GitHub identity belongs to the App installation before issuing clone job |
| Canary leak regression | Information Disclosure | Automated canary leak test suite in Vitest failing CI if synthetic secret is detected |

---

## Sources
- [npm: @octokit/auth-app] - Installation access token creation and options
- [npm: @octokit/rest] - GitHub REST API endpoints for installations and repositories
- [git-scm.com/docs/git-config] - `http.extraheader` parameter specification
- [docs.github.com/en/apps] - GitHub App installation access token lifecycle and scopes
