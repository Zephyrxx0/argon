---
phase: 07-authenticated-ingestion-private-repo-selector
plan: "03"
subsystem: web-ui
tags: [radix-tabs, repo-picker, fuzzy-search, contributor-identity, you-badge, node-inspector, ui-spec]

# Dependency graph
requires:
  - plan: 07-01
    provides: Secret-scrubbed git transport and redaction pipeline
  - plan: 07-02
    provides: Backend GitHubAppService, repository listing endpoints, and identity linking
provides:
  - Searchable RepoPicker component with debounced fuzzy filter and organization pills
  - Upgraded tabbed IngestModal ("Your Repositories" vs "Public Git URL")
  - Visual contributor attribution with verified GitHub badges and [YOU] indicators in ContributorPicker and NodeInspector
affects: [web, canvas, contributor]

actuals:
  tokens: 4500
  tasks: 2
  commits: 1

tech-stack:
  added: ["@radix-ui/react-tabs@^1.1.3"]
  patterns: [Radix tabs composition, 150ms debounced fuzzy filtering, verified contributor profile badges, [YOU] session identity binding]

key-files:
  created:
    - apps/web/components/workspace/repo-picker.tsx
    - apps/web/tests/components/ingest-modal-picker.test.tsx
    - apps/web/tests/components/contributor-identity.test.tsx
  modified:
    - apps/web/components/workspace/ingest-modal.tsx
    - apps/web/components/contributor/contributor-picker.tsx
    - apps/web/components/canvas/node-inspector.tsx
    - apps/web/app/providers.tsx
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Used Radix Tabs in IngestModal to separate private repository selection from public Git URLs while preserving Cytoscape canvas state (D-09)"
  - "Implemented 150ms debounced fuzzy search and dynamic organization filter pills across authorized repositories (D-11)"
  - "Conditioned [YOU] badge strictly on authenticated session user ID / GitHub login match, never rendering for guest visitors (D-16, T-07-07)"
  - "Enriched Person nodes in NodeInspector with GitHub avatar, verified profile badge, and external profile link (D-16)"

patterns-established:
  - "Tabbed Modal UX: Clear separation of authenticated integration workflows from public manual entry"
  - "Identity Badge Invariance: Active user always sees [YOU] on their own contributor pills and inspector cards"

requirements-completed:
  - ING-04
  - TENANT-02

---

# Plan 07-03 Summary: Private Repository Selector & Contributor Identity UI

## What Was Done
1. **Searchable RepoPicker (`apps/web/components/workspace/repo-picker.tsx`)**:
   - Built responsive repository selector querying `/api/v1/github/repositories` with Bearer auth.
   - Client-side 150ms debounced fuzzy search over repository names, owners, and descriptions.
   - Dynamic organization filter pills with repository count badges.
   - Rich rows featuring 24x24px organization avatars (with 2-letter fallback monogram), private Lock icon (amber) or public Globe icon (cyan), default branch badge, and "Index Repo" CTA.
   - Contextual empty states for guest visitors ("Sign In to Access Private Repositories"), zero installations ("No Repositories Found" with GitHub App install link), and no search results ("Clear Filter").

2. **Tabbed IngestModal (`apps/web/components/workspace/ingest-modal.tsx`)**:
   - Implemented Radix Tabs separating "Your Repositories" from "Public Git URL".
   - Integrated `RepoPicker` with seamless transition to the multi-step progress pipeline (`CLONING`, `DERIVING`, `EMBEDDING`, `READY`).
   - Retained and verified SSRF validation (`validateGitUrl`) for public URL submissions.
   - Dispatches background ingestion via `POST /api/v1/workspaces/ingest` and invokes `onIngestComplete`.

3. **Contributor Identity Attribution (`ContributorPicker` & `NodeInspector`)**:
   - `ContributorPicker` (`apps/web/components/contributor/contributor-picker.tsx`):
     - Displays contributor avatars and `[YOU]` badge for the active user matching session ID, GitHub login, or author name.
     - Trigger button displays `[YOU]` badge when the active contributor is selected.
   - `NodeInspector` (`apps/web/components/canvas/node-inspector.tsx`):
     - Enriched Person node header card displaying GitHub avatar, "Verified GitHub Profile" badge with `ShieldCheck` icon, external link to `github.com/<login>`, commit counts, and prominent cyan `[YOU]` pill badge.

## Verification
- Vitest component tests:
  - `apps/web/tests/components/ingest-modal-picker.test.tsx`: 5/5 passed.
  - `apps/web/tests/components/contributor-identity.test.tsx`: 6/6 passed.
  - Full web test suite: 19 test files, 75 passed (100%).
- TypeScript typecheck: `pnpm --filter web typecheck` -> 0 errors.
