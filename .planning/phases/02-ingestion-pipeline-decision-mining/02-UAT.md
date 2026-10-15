---
status: complete
phase: 02-ingestion-pipeline-decision-mining
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
  - 02-04-SUMMARY.md
started: 2026-10-15T19:26:00Z
updated: 2026-10-15T19:26:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Git Clone & Contributor Privacy Hashing (ING-01)
expected: Blobless git clone clones repository into ephemeral temporary directory, `.mailmap` maps authors, SHA-256 hashes contributor email addresses for privacy, and cleanup function destroys directory on completion.
result: pass

### 2. Co-Change Coupling & Monorepo Components (ING-02)
expected: Noise files (lockfiles, vendor directories, minified assets) are excluded, monorepo directory components (`packages/*`, `apps/*`) are detected, and Jaccard similarity is computed over file touches with mass commits (>30 files) squashed and minimum co-commits threshold (>= 3 co-commits, >= 0.15 similarity).
result: pass

### 3. ADR / RFC Mining & Supersession Windows (DEC-01, DEC-02)
expected: Discovers markdown ADRs/RFCs across documentation folders, parses YAML frontmatter and status (`accepted`, `superseded`), and manages temporal windows by setting superseded decision `valid_to = successor.valid_from` while preserving active decisions with `valid_to = null`.
result: pass

### 4. Git Revert Identification & Edge Pairing (ING-03)
expected: Mines commit messages for `Revert "..."` and `This reverts commit <hash>` signatures, maps revert commits to original target commits, and creates `(:PullRequest)-[:REVERTS]->(:PullRequest)` relationships.
result: pass

### 5. 512-d Matryoshka Decision Vectorization (EMB-01, VEC-01)
expected: Decision titles and summaries are batched and embedded via `ArgonEmbedder` to strictly 512 dimensions with unit L2 norm using Transformers.js EmbeddingGemma-2 on Node.js CPU.
result: pass

### 6. FalkorDB Batch Writer & IngestJob Lifecycle (JOB-01, D-14, D-15)
expected: Database writes are chunked into 500-item parameterized openCypher `UNWIND` batches, and `(:IngestJob)` node lifecycle state transitions through `queued` (0.0), `cloning` (0.15), `mining` (0.45), `indexing` (0.80), and `completed` (1.0).
result: pass

### 7. CLI Headless Ingestion Entrypoint (D-13)
expected: `argon-ingest` CLI executable is runnable via binary or npm script with `--repo`, `--workspace`, `--depth`, and `--keep-clone` arguments and clean status logging.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

<!-- None: all automated tests passed -->

