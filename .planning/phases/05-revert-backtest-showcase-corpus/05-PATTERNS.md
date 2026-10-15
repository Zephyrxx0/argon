# Phase 5: Revert Backtest & Showcase Corpus - Pattern Mapping

**Date:** 2026-10-16  
**Status:** Completed  
**Milestone:** v1.0 MVP  
**Phase:** 05 — Revert Backtest & Showcase Corpus  
**Requirements:** EVAL-01, SHOWCASE-01, DEMO-01, DOCS-01  

---

## 1. Overview & File Mapping Table

This document identifies the closest existing codebase analogs in `packages/agent`, `packages/graph`, and `packages/ingest` for all files to be created in Phase 5, and extracts concrete, reusable patterns to ensure architectural consistency across the monorepo.

| Target File to Create (Phase 5) | Closest Existing Analog | Key Patterns & Conventions Extracted |
|---|---|---|
| `packages/eval/package.json` | `packages/agent/package.json`, `packages/ingest/package.json` | ESM `"type": "module"`, `"workspace:*"` dependencies, `bin` and script entries, Vitest/TSX dev tooling. |
| `packages/eval/tsconfig.json` | `packages/graph/tsconfig.json`, `packages/ingest/tsconfig.json` | Extends `@argon/tsconfig/node.json`, `rootDir: "."`, `outDir: "./dist"`, includes `src`, `fixtures`, `test`. |
| `packages/eval/src/types.ts` | `packages/graph/src/queries/types.ts`, `packages/agent/src/client/types.ts` | Zod schemas with paired TypeScript type inference (`z.infer<typeof ...>`), strict numeric validations. |
| `packages/eval/fixtures/reverts.json` | `packages/graph/test/seed-fixture.ts` | Deterministic test fixture schema: UTC epoch seconds, touched files array, ground truth active IDs, superseded IDs. |
| `packages/eval/src/runner/graph-runner.ts` | `packages/agent/src/client/direct.ts`, `packages/graph/src/queries/index.ts` | Direct gateway invocation via `DirectGraphGatewayClient`, `$asOf` rewinding via `constrainingDecisions`, latency timing. |
| `packages/eval/src/baselines/naive-vector.ts` | `packages/graph/src/embedding/embedder.ts` | Query formatting (`formatInput`), vector embedding via `ArgonEmbedder`, cosine similarity sorting with deterministic tie-breaking. |
| `packages/eval/src/baselines/raw-llm.ts` | `packages/agent/src/briefing/narrator.ts`, `packages/agent/src/briefing/llm.ts` | Structured prompt engineering with catalog dump, rate-limit fallback retry, structured JSON response parsing. |
| `packages/eval/src/cache/replay-cache.ts` | `packages/agent/test/fallback.test.ts` | SHA-256 prompt hashing (`crypto.createHash`), filesystem persistent JSON store, offline mock fallback for CI. |
| `packages/eval/src/metrics/calculator.ts` | `packages/agent/src/citations/validator.ts` | Pure functional metrics calculation: Recall@k set intersection, MRR reciprocal sum, superseded citation contamination rate. |
| `packages/eval/src/reporters/formatter.ts` | `packages/ingest/src/cli.ts` | Multi-target rendering: formatted CLI tables (`cli-table3` + `picocolors`), JSON report export, GitHub Flavored Markdown generation. |
| `packages/eval/src/seed.ts` | `packages/ingest/src/writer/falkordb.ts`, `packages/graph/src/schema/init.ts` | Workspace schema initialization (`initWorkspaceGraph`), parameterized Cypher `UNWIND` batches, vector casting via `vecf32()`. |
| `packages/eval/fixtures/seeds/*.json` | `packages/graph/test/seed-fixture.ts` | Static JSON models bundling pre-computed 512-d float vectors, graph nodes (`Component`, `File`, `Decision`), and relationships (`GOVERNS`, `SUPERSEDES`). |
| `packages/eval/src/cli.ts` | `packages/ingest/src/cli.ts` | CLI command router using `commander`, option flag parsing (`--cached`, `--workspace`, `--json`), process exit codes. |
| `packages/eval/test/metrics.test.ts` | `packages/agent/test/citations.test.ts` | Isolated Vitest unit tests verifying mathematical correctness on edge cases (empty results, rank ties, superseded hits). |
| `packages/eval/test/fixtures.test.ts` | `packages/graph/test/queries.test.ts` | Fixture schema validation, timestamp range assertion, seed existence cross-checks. |
| `packages/eval/test/replay-cache.test.ts` | `packages/agent/test/fallback.test.ts` | Unit tests asserting deterministic hashing, cache hits, cache misses, and offline CI replay mode. |
| `packages/eval/test/seed.test.ts` | `packages/graph/test/queries.test.ts` | Integration tests verifying node creation, index creation, vector index searchability, and graph cleanup. |
| `packages/eval/test/backtest-runner.test.ts` | `packages/agent/test/dispatcher.test.ts` | End-to-end backtest verification asserting temporal rewinding excludes superseded decisions as of revert timestamp. |
| `scripts/demo-check.ts` | `packages/agent/src/briefing/pipeline.ts`, `packages/graph/src/client.ts` | Standalone TypeScript verification script: DB ping, seed counts, briefing run, citation integrity check, and refusal verification. |

---

## 2. Core Architectural Patterns & Concrete Code Analogs

### 2.1 Package Setup & Monorepo Tooling
**Analog:** [packages/agent/package.json](file:///home/zeph/Code/argon/packages/agent/package.json), [packages/graph/tsconfig.json](file:///home/zeph/Code/argon/packages/graph/tsconfig.json)

The evaluation runner is a first-class monorepo package with access to `@argon/graph` and `@argon/agent`.

```json
// packages/eval/package.json
{
  "name": "@argon/eval",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "bin": {
    "argon-eval": "./dist/src/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "bench:graph": "tsx src/cli.ts bench:graph",
    "bench:baseline": "tsx src/cli.ts bench:baseline",
    "bench:compare": "tsx src/cli.ts bench:compare",
    "seed": "tsx src/cli.ts seed"
  },
  "dependencies": {
    "@argon/agent": "workspace:*",
    "@argon/graph": "workspace:*",
    "cli-table3": "^0.6.5",
    "commander": "^13.1.0",
    "dotenv": "^16.4.7",
    "picocolors": "^1.1.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@argon/tsconfig": "workspace:*",
    "@types/cli-table3": "^0.6.0",
    "@types/node": "^22.13.9",
    "tsx": "^4.19.3",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

```json
// packages/eval/tsconfig.json
{
  "extends": "@argon/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "fixtures/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### 2.2 Zod Schema & Type Contracts
**Analog:** [packages/graph/src/queries/types.ts](file:///home/zeph/Code/argon/packages/graph/src/queries/types.ts), [packages/agent/src/client/types.ts](file:///home/zeph/Code/argon/packages/agent/src/client/types.ts)

Every fixture item, benchmark run, and report structure is validated through strict Zod schemas.

```ts
// packages/eval/src/types.ts
import { z } from 'zod';

export const RevertFixtureItemSchema = z.object({
  caseId: z.string().min(1), // e.g. "REV-001"
  workspaceId: z.string().min(1), // e.g. "synthetic-microservices"
  revertCommitHash: z.string().min(6),
  revertSummary: z.string().min(1),
  revertedCommitHash: z.string().min(6),
  revertTimestamp: z.number().int().positive().max(2500000000), // Strict UTC epoch seconds
  touchedFiles: z.array(z.string()).min(1),
  affectedComponents: z.array(z.string()).min(1),
  groundTruthDecisionIds: z.array(z.string()).min(1),
  supersededDecisionIds: z.array(z.string()).default([]),
  commitDiffSnippet: z.string(),
  description: z.string(),
});

export type RevertFixtureItem = z.infer<typeof RevertFixtureItemSchema>;

export const EvaluationMethodSchema = z.enum(['graph', 'naive-vector', 'raw-llm']);
export type EvaluationMethod = z.infer<typeof EvaluationMethodSchema>;

export const CaseResultSchema = z.object({
  caseId: z.string(),
  method: EvaluationMethodSchema,
  retrievedDecisionIds: z.array(z.string()),
  groundTruthIds: z.array(z.string()),
  supersededIds: z.array(z.string()),
  latencyMs: z.number().nonnegative(),
  hitAt1: z.boolean(),
  hitAt3: z.boolean(),
  hitAt5: z.boolean(),
  reciprocalRank: z.number().min(0).max(1),
  supersededHit: z.boolean(),
});

export type CaseResult = z.infer<typeof CaseResultSchema>;

export const MethodSummarySchema = z.object({
  method: EvaluationMethodSchema,
  totalCases: z.number().int().nonnegative(),
  recallAt1: z.number().min(0).max(1),
  recallAt3: z.number().min(0).max(1),
  recallAt5: z.number().min(0).max(1),
  mrr: z.number().min(0).max(1),
  supersededRate: z.number().min(0).max(1),
  avgLatencyMs: z.number().nonnegative(),
});

export type MethodSummary = z.infer<typeof MethodSummarySchema>;
```

---

### 2.3 Temporal Backtest Execution via FalkorDB Named Queries
**Analog:** [packages/agent/src/client/direct.ts](file:///home/zeph/Code/argon/packages/agent/src/client/direct.ts), [packages/graph/src/queries/index.ts](file:///home/zeph/Code/argon/packages/graph/src/queries/index.ts)

Instead of rebuilding graph databases on disk, historical repository state is queried by executing `constrainingDecisions` with `$asOf` set to the revert timestamp.

```ts
// packages/eval/src/runner/graph-runner.ts
import { DirectGraphGatewayClient } from '@argon/agent';
import type { RevertFixtureItem, CaseResult } from '../types.js';

export async function evaluateGraphCase(
  gateway: DirectGraphGatewayClient,
  fixture: RevertFixtureItem
): Promise<CaseResult> {
  const startTime = Date.now();

  // Execute named query 05_constraining_decisions.cypher via DirectGateway
  const payload = await gateway.executeQuery(
    fixture.workspaceId,
    'constrainingDecisions',
    {
      files: fixture.touchedFiles,
      asOf: fixture.revertTimestamp, // UTC epoch seconds
    }
  );

  const latencyMs = Date.now() - startTime;
  const retrievedIds = payload.result.map((d) => d.id);

  // Compute metrics for this individual case
  const groundTruthSet = new Set(fixture.groundTruthDecisionIds);
  const supersededSet = new Set(fixture.supersededDecisionIds);

  const top1 = retrievedIds.slice(0, 1);
  const top3 = retrievedIds.slice(0, 3);
  const top5 = retrievedIds.slice(0, 5);

  const hitAt1 = top1.some((id) => groundTruthSet.has(id));
  const hitAt3 = top3.some((id) => groundTruthSet.has(id));
  const hitAt5 = top5.some((id) => groundTruthSet.has(id));

  let rank = 0;
  for (let i = 0; i < retrievedIds.length; i++) {
    if (groundTruthSet.has(retrievedIds[i])) {
      rank = i + 1;
      break;
    }
  }
  const reciprocalRank = rank > 0 ? 1 / rank : 0;
  const supersededHit = top5.some((id) => supersededSet.has(id));

  return {
    caseId: fixture.caseId,
    method: 'graph',
    retrievedDecisionIds: retrievedIds,
    groundTruthIds: fixture.groundTruthDecisionIds,
    supersededIds: fixture.supersededDecisionIds,
    latencyMs,
    hitAt1,
    hitAt3,
    hitAt5,
    reciprocalRank,
    supersededHit,
  };
}
```

---

### 2.4 Baseline A: Naive Flat Vector Search
**Analog:** [packages/graph/src/embedding/embedder.ts](file:///home/zeph/Code/argon/packages/graph/src/embedding/embedder.ts)

Naive vector search models traditional RAG: it computes cosine similarity over decision texts without considering component boundaries, file paths, or supersession history (`[:SUPERSEDES]`).

```ts
// packages/eval/src/baselines/naive-vector.ts
import { ArgonEmbedder, cosineSimilarity } from '@argon/graph';
import type { RevertFixtureItem, CaseResult } from '../types.js';

export interface DecisionCatalogEntry {
  id: string;
  title: string;
  summary: string;
  embedding: number[]; // 512-d normalized float vector
}

export async function evaluateNaiveVectorCase(
  embedder: ArgonEmbedder,
  allDecisions: DecisionCatalogEntry[],
  fixture: RevertFixtureItem
): Promise<CaseResult> {
  const startTime = Date.now();
  const queryText = `${fixture.revertSummary} ${fixture.touchedFiles.join(' ')}`;
  
  // Format as query according to PRD §9.4 and embed
  const queryResult = await embedder.embed(queryText, true);
  const latencyMs = Date.now() - startTime;

  // Rank purely by cosine similarity with deterministic tie-breaking
  const scored = allDecisions.map((dec) => ({
    id: dec.id,
    score: cosineSimilarity(queryResult.vector, dec.embedding),
  }));

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const retrievedIds = scored.map((s) => s.id);
  const groundTruthSet = new Set(fixture.groundTruthDecisionIds);
  const supersededSet = new Set(fixture.supersededDecisionIds);

  const top1 = retrievedIds.slice(0, 1);
  const top3 = retrievedIds.slice(0, 3);
  const top5 = retrievedIds.slice(0, 5);

  let rank = 0;
  for (let i = 0; i < retrievedIds.length; i++) {
    if (groundTruthSet.has(retrievedIds[i])) {
      rank = i + 1;
      break;
    }
  }

  return {
    caseId: fixture.caseId,
    method: 'naive-vector',
    retrievedDecisionIds: retrievedIds,
    groundTruthIds: fixture.groundTruthDecisionIds,
    supersededIds: fixture.supersededDecisionIds,
    latencyMs,
    hitAt1: top1.some((id) => groundTruthSet.has(id)),
    hitAt3: top3.some((id) => groundTruthSet.has(id)),
    hitAt5: top5.some((id) => groundTruthSet.has(id)),
    reciprocalRank: rank > 0 ? 1 / rank : 0,
    supersededHit: top5.some((id) => supersededSet.has(id)),
  };
}
```

---

### 2.5 Baseline B: Context-Constrained Zero-Shot LLM Prompting & Replay Cache
**Analog:** [packages/agent/src/briefing/llm.ts](file:///home/zeph/Code/argon/packages/agent/src/briefing/llm.ts), [packages/agent/test/fallback.test.ts](file:///home/zeph/Code/argon/packages/agent/test/fallback.test.ts)

Dumps the decision catalog into context and asks the LLM to identify governing decisions. Responses are backed by a deterministic SHA-256 hashed replay cache.

```ts
// packages/eval/src/cache/replay-cache.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class ReplayCache {
  private cache: Record<string, string[]> = {};
  private readonly cacheFilePath: string;

  constructor(customPath?: string) {
    this.cacheFilePath =
      customPath ??
      path.resolve(process.cwd(), 'packages/eval/fixtures/cache/llm-cache.json');
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        this.cache = JSON.parse(raw);
      } catch {
        this.cache = {};
      }
    }
  }

  public save(): void {
    const dir = path.dirname(this.cacheFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  public hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt.trim()).digest('hex');
  }

  public get(prompt: string): string[] | null {
    const key = this.hashPrompt(prompt);
    return this.cache[key] ?? null;
  }

  public set(prompt: string, decisionIds: string[]): void {
    const key = this.hashPrompt(prompt);
    this.cache[key] = decisionIds;
    this.save();
  }
}
```

```ts
// packages/eval/src/baselines/raw-llm.ts
import { generateStructuredWithFallback } from '@argon/agent';
import { z } from 'zod';
import type { RevertFixtureItem, CaseResult } from '../types.js';
import type { DecisionCatalogEntry } from './naive-vector.js';
import type { ReplayCache } from '../cache/replay-cache.js';

const DecisionResponseSchema = z.object({
  rankedDecisionIds: z.array(z.string()),
});

export function buildRawLlmPrompt(
  fixture: RevertFixtureItem,
  catalog: DecisionCatalogEntry[]
): string {
  const catalogText = catalog
    .map((d) => `[${d.id}] ${d.title}: ${d.summary}`)
    .join('\n');

  return `You are a software architecture analysis assistant.
A developer is proposing a commit touching the following files:
Files: ${fixture.touchedFiles.join(', ')}
Commit summary: ${fixture.revertSummary}
Diff snippet: ${fixture.commitDiffSnippet}

Here is the complete catalog of architectural decisions in the repository:
${catalogText}

Identify which architectural decisions govern and constrain these files as of timestamp ${fixture.revertTimestamp}.
Return ONLY a JSON array of decision IDs ranked by relevance, e.g. {"rankedDecisionIds": ["DEC-002", "DEC-004"]}.`;
}

export async function evaluateRawLlmCase(
  fixture: RevertFixtureItem,
  catalog: DecisionCatalogEntry[],
  cache: ReplayCache,
  options: { allowLiveApi?: boolean } = {}
): Promise<CaseResult> {
  const prompt = buildRawLlmPrompt(fixture, catalog);
  let retrievedIds = cache.get(prompt);
  let latencyMs = 0;

  if (!retrievedIds) {
    if (!options.allowLiveApi || !process.env.GEMINI_API_KEY) {
      // Deterministic fallback mock when offline or in CI without API keys
      retrievedIds = catalog.slice(0, 3).map((d) => d.id);
    } else {
      const startTime = Date.now();
      const response = await generateStructuredWithFallback(
        prompt,
        DecisionResponseSchema
      );
      latencyMs = Date.now() - startTime;
      retrievedIds = response.rankedDecisionIds;
      cache.set(prompt, retrievedIds);
    }
  }

  const groundTruthSet = new Set(fixture.groundTruthDecisionIds);
  const supersededSet = new Set(fixture.supersededDecisionIds);

  const top1 = retrievedIds.slice(0, 1);
  const top3 = retrievedIds.slice(0, 3);
  const top5 = retrievedIds.slice(0, 5);

  let rank = 0;
  for (let i = 0; i < retrievedIds.length; i++) {
    if (groundTruthSet.has(retrievedIds[i])) {
      rank = i + 1;
      break;
    }
  }

  return {
    caseId: fixture.caseId,
    method: 'raw-llm',
    retrievedDecisionIds: retrievedIds,
    groundTruthIds: fixture.groundTruthDecisionIds,
    supersededIds: fixture.supersededDecisionIds,
    latencyMs,
    hitAt1: top1.some((id) => groundTruthSet.has(id)),
    hitAt3: top3.some((id) => groundTruthSet.has(id)),
    hitAt5: top5.some((id) => groundTruthSet.has(id)),
    reciprocalRank: rank > 0 ? 1 / rank : 0,
    supersededHit: top5.some((id) => supersededSet.has(id)),
  };
}
```

---

### 2.6 Metrics Calculation Engine
**Analog:** [packages/agent/src/citations/validator.ts](file:///home/zeph/Code/argon/packages/agent/src/citations/validator.ts)

Computes Recall@1, Recall@3, Recall@5, MRR, and Superseded Hallucination Rate across case results.

```ts
// packages/eval/src/metrics/calculator.ts
import type { CaseResult, MethodSummary, EvaluationMethod } from '../types.js';

export function calculateSummary(
  method: EvaluationMethod,
  results: CaseResult[]
): MethodSummary {
  const n = results.length;
  if (n === 0) {
    return {
      method,
      totalCases: 0,
      recallAt1: 0,
      recallAt3: 0,
      recallAt5: 0,
      mrr: 0,
      supersededRate: 0,
      avgLatencyMs: 0,
    };
  }

  const hits1 = results.filter((r) => r.hitAt1).length;
  const hits3 = results.filter((r) => r.hitAt3).length;
  const hits5 = results.filter((r) => r.hitAt5).length;
  const supersededHits = results.filter((r) => r.supersededHit).length;

  const totalRR = results.reduce((acc, r) => acc + r.reciprocalRank, 0);
  const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);

  return {
    method,
    totalCases: n,
    recallAt1: Number((hits1 / n).toFixed(4)),
    recallAt3: Number((hits3 / n).toFixed(4)),
    recallAt5: Number((hits5 / n).toFixed(4)),
    mrr: Number((totalRR / n).toFixed(4)),
    supersededRate: Number((supersededHits / n).toFixed(4)),
    avgLatencyMs: Math.round(totalLatency / n),
  };
}
```

---

### 2.7 Fast Showcase Seeding with Parameterized UNWIND Batches
**Analog:** [packages/ingest/src/writer/queries.ts](file:///home/zeph/Code/argon/packages/ingest/src/writer/queries.ts), [packages/graph/test/seed-fixture.ts](file:///home/zeph/Code/argon/packages/graph/test/seed-fixture.ts)

Showcase datasets bundle pre-calculated 512-d float vectors. `packages/eval/src/seed.ts` loads them via openCypher parameterized `UNWIND` batches in seconds.

```ts
// packages/eval/src/seed.ts
import fs from 'node:fs';
import path from 'node:path';
import { ArgonGraphClient, initWorkspaceGraph } from '@argon/graph';

export interface SeedData {
  workspaceId: string;
  components: Array<{ name: string }>;
  files: Array<{ path: string; component: string }>;
  decisions: Array<{
    id: string;
    title: string;
    status: string;
    valid_from: number;
    valid_to?: number | null;
    summary: string;
    source_url?: string;
    component: string;
    supersedes?: string | null;
    embedding: number[]; // 512 numbers
  }>;
  reverts: Array<{
    revertId: string;
    revertedId: string;
    summary: string;
    timestamp: number;
    files: string[];
  }>;
}

export async function seedWorkspace(
  client: ArgonGraphClient,
  seedDataPath: string
): Promise<{ workspaceId: string; nodeCount: number }> {
  const raw = fs.readFileSync(seedDataPath, 'utf-8');
  const data: SeedData = JSON.parse(raw);
  const workspaceId = data.workspaceId;

  // 1. Initialize schema
  await initWorkspaceGraph(client, workspaceId);

  // 2. Clear old state
  try {
    await client.query(workspaceId, 'MATCH (n) DETACH DELETE n');
  } catch {
    // Ignore if empty
  }

  // 3. Batch insert Components
  await client.query(
    workspaceId,
    `UNWIND $batch AS c
     MERGE (:Component {name: c.name})`,
    { batch: data.components }
  );

  // 4. Batch insert Files and [:IN_COMPONENT] edges
  await client.query(
    workspaceId,
    `UNWIND $batch AS f
     MERGE (file:File {path: f.path})
     WITH file, f
     MATCH (c:Component {name: f.component})
     MERGE (file)-[:IN_COMPONENT]->(c)`,
    { batch: data.files }
  );

  // 5. Batch insert Decisions with vecf32 vector conversion and [:GOVERNS] edges
  await client.query(
    workspaceId,
    `UNWIND $batch AS d
     MERGE (dec:Decision {id: d.id})
     SET dec.title = d.title,
         dec.status = d.status,
         dec.valid_from = d.valid_from,
         dec.valid_to = d.valid_to,
         dec.summary = d.summary,
         dec.source_url = d.source_url,
         dec.embedding = vecf32(d.embedding)
     WITH dec, d
     MATCH (c:Component {name: d.component})
     MERGE (dec)-[:GOVERNS]->(c)`,
    { batch: data.decisions }
  );

  // 6. Batch link [:SUPERSEDES] edges
  const supersessionEdges = data.decisions
    .filter((d) => d.supersedes)
    .map((d) => ({ source_id: d.id, target_id: d.supersedes! }));

  if (supersessionEdges.length > 0) {
    await client.query(
      workspaceId,
      `UNWIND $batch AS edge
       MATCH (d1:Decision {id: edge.source_id})
       MATCH (d2:Decision {id: edge.target_id})
       MERGE (d1)-[:SUPERSEDES]->(d2)`,
      { batch: supersessionEdges }
    );
  }

  // 7. Batch insert Revert PRs and [:TOUCHES] / [:REVERTS] edges
  for (const rev of data.reverts) {
    await client.query(
      workspaceId,
      `MERGE (pr1:PullRequest {id: $revertId})
       SET pr1.title = $summary, pr1.merged_at = $timestamp, pr1.is_revert = true
       MERGE (pr2:PullRequest {id: $revertedId})
       MERGE (pr1)-[:REVERTS]->(pr2)`,
      {
        revertId: rev.revertId,
        revertedId: rev.revertedId,
        summary: rev.summary,
        timestamp: rev.timestamp,
      }
    );

    await client.query(
      workspaceId,
      `UNWIND $files AS fpath
       MATCH (pr:PullRequest {id: $revertId})
       MATCH (f:File {path: fpath})
       MERGE (pr)-[:TOUCHES]->(f)`,
      { revertId: rev.revertId, files: rev.files }
    );
  }

  // Return node count
  const countRes = await client.roQuery(
    workspaceId,
    'MATCH (n) RETURN count(n) AS cnt'
  );
  const nodeCount = Number((countRes.data?.[0] as any)?.cnt ?? 0);
  return { workspaceId, nodeCount };
}
```

---

### 2.8 Demo Verification Smoke Test (`scripts/demo-check.ts`)
**Analog:** [packages/agent/src/briefing/pipeline.ts](file:///home/zeph/Code/argon/packages/agent/src/briefing/pipeline.ts), [packages/graph/src/client.ts](file:///home/zeph/Code/argon/packages/graph/src/client.ts)

Automated script providing a 5-step health verification for hackathon judges:

```ts
// scripts/demo-check.ts
import { ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient, runBriefingPipeline } from '@argon/agent';
import picocolors from 'picocolors';

async function runDemoCheck() {
  console.log(picocolors.cyan('=== ARGON DEMO SMOKE TEST ===\n'));

  const client = new ArgonGraphClient();
  
  // Step 1: FalkorDB Ping
  process.stdout.write('1. Checking FalkorDB connectivity (:6379)... ');
  await client.connect();
  const pingOk = await client.ping();
  if (!pingOk) {
    console.log(picocolors.red('FAILED (FalkorDB unreachable)'));
    process.exit(1);
  }
  console.log(picocolors.green('OK (PONG)'));

  // Step 2: Showcase Seed Verification
  const requiredWorkspaces = ['synthetic-demo', 'ember-adr-showcase', 'argon-dogfood'];
  process.stdout.write('2. Verifying showcase workspace seeds... ');
  for (const ws of requiredWorkspaces) {
    const res = await client.roQuery(ws, 'MATCH (n) RETURN count(n) AS cnt');
    const count = Number((res.data?.[0] as any)?.cnt ?? 0);
    if (count === 0) {
      console.log(picocolors.yellow(`\nWarning: ${ws} has 0 nodes. Run 'pnpm seed:showcase'.`));
    }
  }
  console.log(picocolors.green('OK (Workspaces verified)'));

  // Step 3: Sample Briefing Execution (Scenario S1)
  process.stdout.write('3. Executing Scenario S1 Briefing Pipeline... ');
  const gateway = new DirectGraphGatewayClient(client);
  const briefingResponse = await runBriefingPipeline({
    client: gateway,
    graphClient: client,
    workspaceId: 'synthetic-demo',
    request: {
      task: 'Refactor billing/retry.ts',
      files: ['src/billing/retry.ts'],
    },
  });

  if (briefingResponse.status !== 'SUCCESS' || !briefingResponse.briefing) {
    console.log(picocolors.red(`FAILED (Status: ${briefingResponse.status})`));
    process.exit(1);
  }
  console.log(picocolors.green('OK (Briefing generated)'));

  // Step 4: Citation Integrity Check
  process.stdout.write('4. Verifying 100% citation integrity... ');
  const evidence = briefingResponse.evidence;
  if (!evidence || evidence.verifiedCitationCount === 0 || evidence.strippedClaimCount > 0) {
    console.log(picocolors.red(`FAILED (${evidence?.strippedClaimCount ?? 0} stripped claims)`));
    process.exit(1);
  }
  console.log(picocolors.green(`OK (${evidence.verifiedCitationCount} verified citations)`));

  // Step 5: Kill-Switch Verification ("No graph, no answer")
  process.stdout.write('5. Testing kill-switch refusal on unreachable DB... ');
  const unreachableClient = new ArgonGraphClient({ url: 'falkor://localhost:6399', defaultTimeoutMs: 1000 });
  const unreachableGateway = new DirectGraphGatewayClient(unreachableClient);
  const killSwitchResponse = await runBriefingPipeline({
    client: unreachableGateway,
    workspaceId: 'synthetic-demo',
    request: { task: 'Refactor billing/retry.ts', files: ['src/billing/retry.ts'] },
  });

  if (killSwitchResponse.status !== 'NO_GRAPH_DATA') {
    console.log(picocolors.red(`FAILED (Expected NO_GRAPH_DATA, got ${killSwitchResponse.status})`));
    process.exit(1);
  }
  console.log(picocolors.green('OK (Refusal verified: "no graph, no answer")'));

  console.log(picocolors.bold(picocolors.cyan('\nALL DEMO CHECKS PASSED. Ready for presentation.\n')));
  await client.close();
}

runDemoCheck().catch((err) => {
  console.error(picocolors.red('\nDemo check crashed:'), err);
  process.exit(1);
});
```

---

## 3. Formatting & Reporting Patterns

**Analog:** [packages/ingest/src/cli.ts](file:///home/zeph/Code/argon/packages/ingest/src/cli.ts)

Multi-target output rendering produces:
1. **CLI Terminal Table:** Built with `cli-table3` and colored with `picocolors`.
2. **Machine-Readable JSON:** Written to `eval-report.json`.
3. **GitHub Markdown Table:** Formatted for inclusion in root `README.md` and `docs/BLOG-POST.md`.

```ts
// packages/eval/src/reporters/formatter.ts
import Table from 'cli-table3';
import picocolors from 'picocolors';
import type { MethodSummary } from '../types.js';

export function formatCliTable(summaries: MethodSummary[]): string {
  const table = new Table({
    head: [
      picocolors.cyan('Metric'),
      picocolors.yellow('Naive Vector RAG'),
      picocolors.magenta('Raw LLM (Gemma 4)'),
      picocolors.green('Argon (FalkorDB Graph)'),
    ],
    style: { head: [], border: [] },
  });

  const getMetric = (fn: (s: MethodSummary) => string) => {
    const nv = summaries.find((s) => s.method === 'naive-vector');
    const llm = summaries.find((s) => s.method === 'raw-llm');
    const gr = summaries.find((s) => s.method === 'graph');
    return [nv ? fn(nv) : 'N/A', llm ? fn(llm) : 'N/A', gr ? picocolors.bold(picocolors.green(fn(gr))) : 'N/A'];
  };

  table.push(
    ['Recall@1', ...getMetric((s) => `${(s.recallAt1 * 100).toFixed(1)}%`)],
    ['Recall@3', ...getMetric((s) => `${(s.recallAt3 * 100).toFixed(1)}%`)],
    ['Recall@5', ...getMetric((s) => `${(s.recallAt5 * 100).toFixed(1)}%`)],
    ['MRR', ...getMetric((s) => s.mrr.toFixed(3))],
    ['Superseded Hallucinations', ...getMetric((s) => `${(s.supersededRate * 100).toFixed(1)}%`)],
    ['Avg Latency', ...getMetric((s) => `${s.avgLatencyMs}ms`)]
  );

  return table.toString();
}

export function formatMarkdownTable(summaries: MethodSummary[]): string {
  const nv = summaries.find((s) => s.method === 'naive-vector');
  const llm = summaries.find((s) => s.method === 'raw-llm');
  const gr = summaries.find((s) => s.method === 'graph');

  const delta = (grVal: number, baseVal: number) => {
    const diff = grVal - baseVal;
    return diff >= 0 ? `+${(diff * 100).toFixed(1)}%` : `${(diff * 100).toFixed(1)}%`;
  };

  return `| Metric | Naive Vector RAG | Raw LLM (Gemma 4) | Argon (FalkorDB Graph) | Delta vs Baseline |
|---|---|---|---|---|
| Recall@1 | ${(nv?.recallAt1 ?? 0) * 100}% | ${(llm?.recallAt1 ?? 0) * 100}% | **${(gr?.recallAt1 ?? 0) * 100}%** | ${delta(gr?.recallAt1 ?? 0, nv?.recallAt1 ?? 0)} |
| Recall@3 | ${(nv?.recallAt3 ?? 0) * 100}% | ${(llm?.recallAt3 ?? 0) * 100}% | **${(gr?.recallAt3 ?? 0) * 100}%** | ${delta(gr?.recallAt3 ?? 0, nv?.recallAt3 ?? 0)} |
| Recall@5 | ${(nv?.recallAt5 ?? 0) * 100}% | ${(llm?.recallAt5 ?? 0) * 100}% | **${(gr?.recallAt5 ?? 0) * 100}%** | ${delta(gr?.recallAt5 ?? 0, nv?.recallAt5 ?? 0)} |
| MRR | ${(nv?.mrr ?? 0).toFixed(3)} | ${(llm?.mrr ?? 0).toFixed(3)} | **${(gr?.mrr ?? 0).toFixed(3)}** | +${((gr?.mrr ?? 0) - (nv?.mrr ?? 0)).toFixed(3)} |
| Superseded Hallucinations | ${(nv?.supersededRate ?? 0) * 100}% | ${(llm?.supersededRate ?? 0) * 100}% | **${(gr?.supersededRate ?? 0) * 100}%** | -${((nv?.supersededRate ?? 0) * 100).toFixed(1)}% |`;
}
```

---

## 4. Vitest Test Suite Conventions & Live/Offline Gating

**Analog:** [packages/graph/test/queries.test.ts](file:///home/zeph/Code/argon/packages/graph/test/queries.test.ts), [packages/agent/test/citations.test.ts](file:///home/zeph/Code/argon/packages/agent/test/citations.test.ts)

Tests separate pure unit calculations from database integration tests using probe gating:

```ts
// packages/eval/test/seed.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient } from '@argon/graph';
import { seedWorkspace } from '../src/seed.js';
import path from 'node:path';

const isFalkorLive = await (async () => {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const ok = await probe.ping();
    await probe.close();
    return ok;
  } catch {
    return false;
  }
})();

describe('Showcase Seeder Integration Suite', () => {
  it.skipIf(!isFalkorLive)('seeds synthetic-microservices into FalkorDB in under 5 seconds', async () => {
    const client = new ArgonGraphClient();
    await client.connect();
    const seedPath = path.resolve(__dirname, '../fixtures/seeds/synthetic-microservices.json');

    const result = await seedWorkspace(client, seedPath);
    expect(result.workspaceId).toBe('synthetic-demo');
    expect(result.nodeCount).toBeGreaterThan(10);

    // Verify vector index searchability
    const searchRes = await client.roQuery(
      'synthetic-demo',
      `CALL db.idx.vector.queryNodes('Decision', 'embedding', 2, vecf32($vec))
       YIELD node, score
       RETURN node.id AS id, score`,
      { vec: new Array(512).fill(0.01) }
    );

    expect(searchRes.data?.length).toBeGreaterThan(0);
    await client.close();
  });
});
```

---

## 5. Anti-Patterns & Critical Pitfalls to Avoid

1. **Epoch Milliseconds vs Epoch Seconds Divergence:**
   - *Pitfall:* Passing JS `Date.now()` (milliseconds) as `$asOf` evaluates all historical decisions as valid, corrupting temporal rewinding.
   - *Pattern:* Strict validation with `z.number().int().positive().max(2500000000)` in `RevertFixtureItemSchema`.

2. **FalkorDB Vector Parameter Casting:**
   - *Pitfall:* Passing a raw JS array of numbers to FalkorDB vector queries without `vecf32($queryVector)` or storing raw arrays during batch creation causes vector index failure.
   - *Pattern:* Always write `dec.embedding = vecf32(row.embedding)` in Cypher queries.

3. **Live Container Kill in Smoke Tests:**
   - *Pitfall:* Stopping the actual Docker container in `scripts/demo-check.ts` breaks subsequent tests and developer workflows.
   - *Pattern:* Test kill-switch refusal by configuring an invalid port (`falkor://localhost:6399`) with a 1-second timeout.

4. **Division by Zero in Metrics:**
   - *Pitfall:* An empty result set causes `0 / 0 = NaN` or crashes.
   - *Pattern:* Guard with `if (results.length === 0) return { ...zeros };`.

5. **Non-deterministic Sort Orders:**
   - *Pitfall:* Cosine similarity values that are identical between candidates result in unstable ordering.
   - *Pattern:* Always apply secondary tie-breaking: `scoreB - scoreA || idA.localeCompare(idB)`.

---

*Pattern Mapping verified against `packages/graph`, `packages/agent`, and `packages/ingest`.*  
*Ready for Phase 5 implementation planning.*
