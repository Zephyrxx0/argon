# Phase 7: Authenticated Ingestion & Private Repo Selector - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16  
**Phase:** 7-Authenticated Ingestion & Private Repo Selector  
**Areas discussed:** GitHub App Token Minting & Lifecycle, Secret Scrubbing & Git URL Redaction, Private Repo Picker UI & IngestModal UX, Author-to-User Identity Linking (TENANT-02)  

---

## GitHub App Token Minting & Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| apps/gateway service | Gateway holds the GitHub App Private Key, generating short-lived installation tokens on demand for ingestion jobs | ✓ |
| apps/web server route | Next.js API routes handle Octokit App authentication, colocated with Better Auth configuration | |
| You decide | Antigravity chooses based on security boundary isolation | |

**User's choice:** apps/gateway service  
**Notes:** Retains private key credentials securely inside the backend gateway service, isolating token minting from web clients.

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory TTL cache with 5-minute safety buffer | Cached by installationId for up to 55 minutes, avoiding unnecessary GitHub App JWT exchanges during rapid operations | ✓ |
| Strictly ephemeral per clone | Mint a new installation token every single time an ingestion job starts, never caching in memory | |
| You decide | Antigravity picks the standard GitHub API caching approach | |

**User's choice:** In-memory TTL cache with 5-minute safety buffer  
**Notes:** Reduces GitHub API rate limit consumption and latency during concurrent operations.

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory parameter in CloneOptions / IngestConfig | Caller passes installationToken in memory directly to pipeline functions, never exposed via CLI flags, env vars, or disk files | ✓ |
| Environment variable injection | Pass temporary token via GITHUB_TOKEN environment variable to child git processes | |
| You decide | Antigravity implements the cleanest secure in-memory interface | |

**User's choice:** In-memory parameter in CloneOptions / IngestConfig  
**Notes:** Prevents accidental exposure via environment inspection or process listing commands.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual verification | Gateway checks that the user's GitHub account is an authorized member of the installation before granting access to clone the private repository | ✓ |
| Installation token boundary only | Rely on GitHub App installation repository grants directly via the GitHub API response | |
| You decide | Antigravity enforces standard multi-tenant permission validation | |

**User's choice:** Dual verification  
**Notes:** Prevents unauthorized cloning of repositories from installations where the user is not an authorized collaborator.

---

## Secret Scrubbing & Git URL Redaction

| Option | Description | Selected |
|--------|-------------|----------|
| Auth header injection (http.extraheader) | Pass Authorization header via git config args (-c http.extraheader=...), keeping the remote URL completely clean (https://github.com/org/repo) on disk and in .git/config | ✓ |
| URL embedded token with post-clone remote scrubbing | Clone with https://x-access-token:TOKEN@github.com/... and immediately rewrite origin remote URL to clean URL | |
| You decide | Antigravity implements the most secure, leak-proof git transport pattern | |

**User's choice:** Auth header injection (http.extraheader)  
**Notes:** Eliminates token persistence in `.git/config` on disk or exposure in `git remote -v`.

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated redactSecrets utility with GitHub token regexes (ghs_*, ghp_*, Bearer, x-access-token) | Applied systematically to all loggers, catch blocks, and IngestJob error properties | ✓ |
| Generic regex pattern matching only on URLs containing credentials | Match on URLs formatted as https://.*@.* | |
| You decide | Antigravity implements defense-in-depth sanitization matching ASVS Level 1 | |

**User's choice:** Dedicated redactSecrets utility with GitHub token regexes  
**Notes:** Provides defense-in-depth sanitization across all ingestion loggers and error records.

| Option | Description | Selected |
|--------|-------------|----------|
| Structured sanitized error code (AUTH_FAILED_EXPIRED_OR_REVOKED) | Clear user remediation instruction ('GitHub installation token expired or permissions revoked — please re-authorize GitHub App') | ✓ |
| Sanitized git stdout/stderr snippet forwarded directly to user | Raw token patterns scrubbed from output | |
| You decide | Antigravity provides clear error ergonomics | |

**User's choice:** Structured sanitized error code (AUTH_FAILED_EXPIRED_OR_REVOKED)  
**Notes:** Avoids leaking raw git error traces to the frontend while offering clear instructions.

| Option | Description | Selected |
|--------|-------------|----------|
| Canary secret leak tests | Integration test executes simulated clone failure with known canary token (ghs_canary_secret_xyz) and asserts zero occurrences in logs, IngestJob error properties, and stdout/stderr | ✓ |
| Static lint rule | Add regex rule to test suite checking that logger calls never pass raw token variables | |
| You decide | Antigravity implements rigorous leak-prevention test coverage | |

**User's choice:** Canary secret leak tests  
**Notes:** Automated test guarantees leak prevention as part of regression testing.

---

## Private Repo Picker UI & IngestModal UX

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed interface in IngestModal | 'Your Repositories' tab (searchable repo list from GitHub App installations with lock/globe badges) and 'Public URL' tab (direct HTTPS URL for open source showcases) | ✓ |
| Unified search input with auto-complete | Single input field that auto-completes authorized repositories when typing | |
| You decide | Antigravity designs clean cyberpunk UI matching HeaderBar and WorkspaceSwitcher | |

**User's choice:** Tabbed interface in IngestModal  
**Notes:** Clear separation between authenticated organization repositories and public open source URLs.

| Option | Description | Selected |
|--------|-------------|----------|
| Rich repo row | Owner/repo name, Private/Public badge (Lock/Globe icon), default branch badge (main/master), and organization avatar | ✓ |
| Minimal repo row | Just owner/repo name and private lock icon | |
| You decide | Antigravity formats according to terminal typography guidelines | |

**User's choice:** Rich repo row  
**Notes:** Provides rich visual context for identifying repositories quickly.

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side fuzzy search + organization filter pills | Fast instant filtering over authorized installations, with zero latency while typing | ✓ |
| Server-side GitHub API search | Search query forwarded to GitHub API with 300ms debounce on keystrokes | |
| You decide | Antigravity implements responsive client-side filtering | |

**User's choice:** Client-side fuzzy search + organization filter pills  
**Notes:** Instant filtering feedback for authorized installations.

| Option | Description | Selected |
|--------|-------------|----------|
| Contextual empty states with direct action buttons | If guest: 'Sign In with GitHub' button (opens AuthModal); If 0 repos: 'Install GitHub App' link to app installation page + 'Check Again' refresh button | ✓ |
| Hide tab for guests, show static text for 0 repos | Only display 'Your Repositories' tab when authenticated with active installations | |
| You decide | Antigravity follows Better Auth & GitHub App onboarding best practices | |

**User's choice:** Contextual empty states with direct action buttons  
**Notes:** Seamless conversion from guest exploration or missing installation to active repository indexing.

---

## Author-to-User Identity Linking (TENANT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit (:User)-[:IDENTIFIES]->(:Person) edge | Preserves immutable mined git topology while cleanly binding authenticated app accounts to repository contributors | ✓ |
| Merged multi-label (:User:Person) | Collapse User and Person into the same graph node where identity matches | |
| You decide | Antigravity implements the openCypher graph schema best suited for query isolation | |

**User's choice:** Explicit (:User)-[:IDENTIFIES]->(:Person) edge  
**Notes:** Keeps git commit data immutable while enabling tenant-aware personal attribution.

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-factor identity matching | Match by GitHub user emails, GitHub noreply email patterns (*@users.noreply.github.com), or exact case-insensitive login/name match | ✓ |
| Strict primary email match only | Only link when git author email exactly equals GitHub primary account email | |
| You decide | Antigravity implements high-confidence matching with fallback heuristics | |

**User's choice:** Multi-factor identity matching  
**Notes:** Accurately connects GitHub users who commit using noreply or alternative email addresses.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual lifecycle execution | Run identity linking at end of repository ingestion pipeline AND whenever a user signs in to link existing graph nodes | ✓ |
| Ingestion pipeline post-step only | Run linking only at the completion of a repository ingestion run | |
| You decide | Antigravity implements optimal sync timing | |

**User's choice:** Dual lifecycle execution  
**Notes:** Handles both new ingestions and retroactively links authors for users who sign in later.

| Option | Description | Selected |
|--------|-------------|----------|
| 'Verified Profile' & 'You' badges | In NodeInspector and ContributorPicker, show linked GitHub avatar, profile link, and a distinctive 'You' pill for the active user | ✓ |
| ContributorPicker avatar only | Enrich ContributorPicker dropdown with avatars, leaving NodeInspector unchanged | |
| You decide | Antigravity applies consistent cyberpunk design language | |

**User's choice:** 'Verified Profile' & 'You' badges  
**Notes:** Enhances canvas and contributor inspection with clear attribution.

---

## the agent's Discretion

- Exact debounce timing for client-side search filtering (150ms default).
- Fallback placeholder icons when GitHub organization avatars fail to load.
- Specific Cypher transaction batching for linking `(:User)-[:IDENTIFIES]->(:Person)`.

## Deferred Ideas

- SYNC-01 / SYNC-02 / SYNC-03 (Phase 8): GitHub webhook receiver and incremental sync engine on push and pull request events.
- ORG-01 (v3.0): Multi-user organization team spaces with role-based access control.
- CROSS-01 (v3.0): Cross-repository multi-graph dependency analysis.
