# Phase 2 Plan 3: Decision Mining & Temporal Windows Summary

**Executed:** 2026-10-15
**Status:** Complete
**Plan:** `02-03-PLAN.md`

## What Was Built
1. **Markdown ADR/RFC Scanner & Parser (`adr.ts`):**
   - Discovers architectural documentation across `**/adr/**/*.md`, `**/rfcs/**/*.md`, `**/decisions/**/*.md`, and `**/docs/arch*/**/*.md` conforming to D-09.
   - Extracts structured metadata (title, status: `accepted` | `superseded` | `proposed`, supersedes references, and summaries) from frontmatter and headers conforming to DEC-01.
2. **Git Revert Miner (`reverts.ts`):**
   - Analyzes commit messages for `Revert "..."` and `This reverts commit <hash>` signatures.
   - Maps revert commits directly to their target commits to generate `(:PullRequest)-[:REVERTS]->(:PullRequest)` edges conforming to ING-03 and D-10.
3. **Commit Decision Miner (`commits.ts`):**
   - Employs a Tier 0 regex pre-filter (`/(?:revert|supersede|deprecate|architect|rfc|adr|decision|breaking\s+change)/i`) to isolate architectural commits.
   - Extracts `Decision` nodes with epoch second `valid_from` timestamps conforming to DEC-01 and D-10.
4. **Temporal Window & Supersession Manager (`adr.ts`):**
   - Automatically tracks supersession transitions (`(B)-[:SUPERSEDES]->(A)`): when $B$ supersedes $A$, updates $A\text{.valid\_to} = B\text{.valid\_from}$ and marks $A\text{.status} = \text{'superseded'}$, maintaining active decisions with `valid_to = null` conforming to DEC-02 and D-11.
5. **Decision Vectorization Pipeline (`embed.ts`):**
   - Batches decision texts in chunks of 8–16 and invokes `ArgonEmbedder` from `@argon/graph` to produce 512-d normalized Matryoshka vectors conforming to D-12, EMB-01, and VEC-01.
6. **Unit Test Suite (`mining.test.ts`):**
   - 6/6 passing Vitest tests validating frontmatter parsing, recursive ADR discovery, temporal window closing, revert message pairing, commit heuristics, and batched 512-d embeddings.

## Verification
- `pnpm --filter @argon/ingest exec tsc --noEmit` passes with 0 errors.
- `pnpm --filter @argon/ingest test` executes and passes 15/15 tests across all test suites in 1.50s.
