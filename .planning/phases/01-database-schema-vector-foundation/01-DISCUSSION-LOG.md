# Phase 1: Database Schema & Vector Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 1-Database Schema & Vector Foundation
**Areas discussed:** Monorepo & Next.js App Setup, FalkorDB Driver & Test Harness, Named Query Loader & Type Contracts, Embedding Pipeline & Fallback Contract

---

## Monorepo & Next.js App Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Turborepo + pnpm workspaces with shared tsconfig | Fast task caching, unified dev/build pipelines across Next.js and backend packages. | ✓ |
| Lightweight pnpm workspaces without Turborepo | Pure pnpm `-r` scripts with minimal external build tooling. | |
| You decide | Setup Turborepo with pnpm workspaces optimized for Next.js App Router and TypeScript packages. | |

**User's choice:** Turborepo + pnpm workspaces with shared tsconfig
**Notes:** Establishes cross-workspace task pipeline and caching.

| Option | Description | Selected |
|--------|-------------|----------|
| Scaffold apps/web now with Next.js 15 (App Router), Tailwind CSS v4, and shadcn base | Verifies monorepo workspace dependencies and package imports from day one. | ✓ |
| Minimal stub in Phase 1 | Create an empty placeholder package.json for apps/web and defer all Next.js/Tailwind setup to Phase 4. | |
| You decide | Scaffold Next.js 15 with App Router and Tailwind to ensure seamless TypeScript resolution across the monorepo. | |

**User's choice:** Scaffold apps/web now with Next.js 15 (App Router), Tailwind CSS v4, and shadcn base
**Notes:** User specifically requested Next.js app inclusion during area selection.

| Option | Description | Selected |
|--------|-------------|----------|
| Direct TypeScript source consumption (`transpilePackages` in Next.js, tsx/ts-node in Node) | No build/dist step needed for internal packages during local development. | ✓ |
| Compiled package exports via `tsup` | Each package builds .d.ts and .js into dist/ before apps can import it. | |
| You decide | Setup direct TypeScript source exports with tsx/transpilePackages for seamless developer experience. | |

**User's choice:** Direct TypeScript source consumption (`transpilePackages` in Next.js, tsx/ts-node in Node)
**Notes:** Zero-friction local dev experience; changes in `packages/graph` reflect immediately in apps.

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind CSS v4 + brutalist cyberpunk theme tokens + lucide-react + dark mode by default | Prepares the brutalist visual language specified in PRD §6.4. | ✓ |
| Standard neutral shadcn/ui | Clean default styling, customizing colors and tokens later in Phase 4. | |
| You decide | Configure dark brutalist tokens with monospace accents fitting the Argon terminal aesthetic. | |

**User's choice:** Tailwind CSS v4 + brutalist cyberpunk theme tokens + lucide-react + dark mode by default
**Notes:** Pre-configures design tokens early to match product concept.

---

## FalkorDB Driver & Test Harness

| Option | Description | Selected |
|--------|-------------|----------|
| Official `falkordb` npm client | Native graph selection (`db.selectGraph(workspaceId)`), built-in result record parsing, and vector query support. | ✓ |
| Raw `@redis/client` with manual command dispatch | Direct control over Redis connection strings, but requires custom response table parsing. | |
| You decide | Use official `falkordb` client with custom safety wrappers for read-only query enforcement. | |

**User's choice:** Official `falkordb` npm client
**Notes:** Standardized client with native graph-per-workspace support.

| Option | Description | Selected |
|--------|-------------|----------|
| Root `docker-compose.yml` (port 6379, persistent volume) + `pnpm db:up` script with healthcheck | Simple, reliable, matches production VM Docker layout. | ✓ |
| Automated Testcontainers in Vitest | Automatically spins up and down isolated FalkorDB containers per test run. | |
| Dual setup | `docker-compose.yml` for dev, reusable by integration tests with a fallback check. | |

**User's choice:** Root `docker-compose.yml` (port 6379, persistent volume) + `pnpm db:up` script with healthcheck
**Notes:** Consistent environment between dev and CI.

| Option | Description | Selected |
|--------|-------------|----------|
| Programmatic idempotent initializer (`initWorkspaceGraph(workspaceId)`) | Checks and applies constraints & 512-d vector index automatically when a workspace is created or connected. | ✓ |
| Standalone CLI migration script (`pnpm db:schema:apply`) | Explicit manual or deployment-time schema execution. | |
| You decide | Provide both a programmatic `initWorkspaceGraph` function and a CLI command for manual verification. | |

**User's choice:** Programmatic idempotent initializer (`initWorkspaceGraph(workspaceId)`)
**Notes:** Zero-config workspace provisioning.

| Option | Description | Selected |
|--------|-------------|----------|
| Custom `ArgonGraphClient` with strict 5s timeout and typed `FalkorUnavailableError` | Directly powers the "no graph, no answer" refusal contract and guarantees `RO_QUERY` usage for read queries. | ✓ |
| Standard client error bubbling | Pass raw FalkorDB/Redis errors up to caller endpoints to handle individually. | |
| You decide | Implement `ArgonGraphClient` wrapper enforcing `RO_QUERY`, timeouts, and standardized error types. | |

**User's choice:** Custom `ArgonGraphClient` with strict 5s timeout and typed `FalkorUnavailableError`
**Notes:** Essential for hackathon judging kill-switch test.

---

## Named Query Loader & Type Contracts

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone `.cypher` files in `packages/graph/queries/*.cypher` with build-time/runtime loader | Clean syntax highlighting, directly editable, and testable via FalkorDB CLI. | ✓ |
| TypeScript template literals in `queries.ts` | Co-locates query text with TypeScript parameter types in pure TS files. | |
| You decide | Author as `.cypher` files with an automated bundler export to avoid runtime path resolution issues across Next.js and Cloud Run. | |

**User's choice:** Standalone `.cypher` files in `packages/graph/queries/*.cypher` with build-time/runtime loader
**Notes:** Maintains pure openCypher files for clarity and testing.

| Option | Description | Selected |
|--------|-------------|----------|
| Strict Zod schemas with inferred TypeScript types (`z.infer`) | Validates query parameters before execution and guarantees response shape integrity for gateway/LLM consumers. | ✓ |
| Pure TypeScript types without runtime validation | Minimal runtime overhead, trusting FalkorDB output types. | |
| You decide | Define shared Zod contracts for parameters and results across all 8 named queries. | |

**User's choice:** Strict Zod schemas with inferred TypeScript types (`z.infer`)
**Notes:** Guarantees runtime safety for graph responses before reaching LLM narration.

| Option | Description | Selected |
|--------|-------------|----------|
| Normalized dual-payload: typed records + Cytoscape-ready subgraph (`{ nodes, edges }`) | Directly powers Cytoscape graph canvas and LLM evidence narration without duplicate mapping logic. | ✓ |
| Flat records array only | Return raw query rows and leave UI graph transformation to the frontend. | |
| You decide | Provide helper transformers that map Cypher paths to Cytoscape format alongside typed records. | |

**User's choice:** Normalized dual-payload: typed records + Cytoscape-ready subgraph (`{ nodes, edges }`)
**Notes:** Eliminates redundant transformation logic between backend gateway and frontend canvas.

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic fixture graph test suite running against live FalkorDB | Seeds a known graph and verifies all 8 queries (traversals, PageRank, vector search, temporal filters) with exact assertions. | ✓ |
| Unit tests with mocked driver calls only | Fast in CI, but cannot verify real openCypher syntax compatibility with FalkorDB. | |
| You decide | Run comprehensive integration tests against local FalkorDB container with a deterministic seed graph. | |

**User's choice:** Deterministic fixture graph test suite running against live FalkorDB
**Notes:** Proves end-to-end FalkorDB algorithm and openCypher syntax validity.

---

## Embedding Pipeline & Fallback Contract

| Option | Description | Selected |
|--------|-------------|----------|
| `onnx-community/embeddinggemma-2` (q8, 512-d Matryoshka) with immediate fallback to Gemini API (`text-embedding-004`) | Matryoshka truncation + L2 norm, with Gemini API fallback if ONNX fails to load on Node CPU. | ✓ |
| Standard lightweight `Xenova/bge-small-en-v1.5` (native 512-d, ~67MB) | Primary local embedder to guarantee fast CPU inference and zero cold-start latency. | |
| You decide | Support EmbeddingGemma-2 with automatic fallback to Gemini API or BGE-small if memory/download limits are exceeded. | |

**User's choice:** `onnx-community/embeddinggemma-2` (q8, 512-d Matryoshka) with immediate fallback to Gemini API (`text-embedding-004`)
**Notes:** Conforms to GD-03 decision with Matryoshka truncation.

| Option | Description | Selected |
|--------|-------------|----------|
| Project-level `.cache/models/` (git-ignored) with `TRANSFORMERS_CACHE` override | Keeps downloads local to the project, easily cleanable, and reproducible in Docker. | ✓ |
| Default user home directory (`~/.cache/huggingface/hub`) | Shares downloaded models globally across projects. | |
| You decide | Configure `.cache/models/` by default with fallback to system cache. | |

**User's choice:** Project-level `.cache/models/` (git-ignored) with `TRANSFORMERS_CACHE` override
**Notes:** Keeps downloads isolated in workspace.

| Option | Description | Selected |
|--------|-------------|----------|
| Transparent fallback with env override (`EMBEDDING_PROVIDER=local|gemini|auto`) | Attempts local ONNX first, automatically falls back to Gemini API on error/timeout, while logging provider switch. | ✓ |
| Strict fail-fast via `EMBEDDING_PROVIDER` | No automatic fallback; fails immediately if the explicitly selected provider fails. | |
| You decide | Support automatic fallback with clear telemetry logs indicating which provider produced the vector. | |

**User's choice:** Transparent fallback with env override (`EMBEDDING_PROVIDER=local|gemini|auto`)
**Notes:** Uninterrupted ingestion even if local CPU runtime hits memory spikes.

| Option | Description | Selected |
|--------|-------------|----------|
| Comprehensive math & semantic test | Asserts dimension === 512, L2 norm === 1.0 (±1e-4), and semantic similarity check between related vs unrelated concepts. | ✓ |
| Basic shape check only | Verifies array length === 512 and elements are floating point numbers. | |
| You decide | Implement strict unit tests covering exact dimension, L2 normalization, and semantic sanity check. | |

**User's choice:** Comprehensive math & semantic test
**Notes:** Mathematical proof that vector index inputs strictly adhere to FalkorDB cosine requirements.

---

## the agent's Discretion

- Internal package directory layout (`src/client.ts`, `src/queries/`, `src/embedding/`, `src/schema/`).
- Docker compose volume mount paths (`.falkordb-data/`).

## Deferred Ideas

- None — discussion stayed within Phase 1 scope.
