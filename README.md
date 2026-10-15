# Argon (Ar)

> **Context for AI Agents & Engineers** — *"What must I know before I touch this?"*  
> An evidence-backed briefing engine grounded in the FalkorDB knowledge graph. **"No graph, no answer."**

---

## ⚡ Overview

Argon is a project-memory agent that analyzes target scopes (files, monorepo components, diffs, or natural language task prompts) against an openCypher knowledge graph in FalkorDB. 

Instead of vague summaries or ungrounded LLM hallucinations, Argon generates an executive briefing where **every single claim** is mathematically computed from graph traversals, PageRank centrality, co-change coupling, temporal supersession windows, and vector similarity search. Claims are strictly cited to verifiable FalkorDB node IDs (`#id`). If citation verification fails or zero citations are proved, Argon triggers its refusal kill switch: **"No graph, no answer."**

---

## 🏛 Architecture

```
                          ┌────────────────────────┐
                          │   Next.js 15 Web App   │
                          │   (Tailwind / Cytoscape)│
                          └───────────┬────────────┘
                                      │
                        POST /api/briefing (Zod Schema)
                                      ▼
                      ┌─────────────────────────────────┐
                      │    Briefing Agent Pipeline      │
                      │       (@argon/agent)            │
                      └───────────────┬─────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│     Hono Query Gateway    │                   │   Direct Graph Client     │
│       (apps/gateway)      │                   │     (@argon/graph)        │
│   (VPC Egress / RO_QUERY) │                   │ (In-Process FalkorDB SDK) │
└─────────────┬─────────────┘                   └─────────────┬─────────────┘
              │                                               │
              └───────────────────────┬───────────────────────┘
                                      ▼
                       ┌─────────────────────────────┐
                       │          FalkorDB           │
                       │   openCypher Knowledge      │
                       │   512-d Vector Index        │
                       └─────────────────────────────┘
```

### Monorepo Workspaces

- **`apps/web`**: Next.js 15 App Router frontend featuring a resizable split viewport, dual-invocation command bar (`Cmd+K`), guest workspace switcher, 2077 brutalist tweakcn evidence cards, and an interactive Cytoscape.js force-directed physics canvas.
- **`apps/gateway`**: Authenticated Hono HTTP service running on Cloud Run / Node.js exposing the 8 parameterized named queries over `GRAPH.RO_QUERY` with VPC egress.
- **`packages/agent`**: The briefing orchestration engine. Dispatches parallel retrieval queries, isolates evidence in prompt blocks, prompts Gemma 4 (`gemma-4-31b-it` with fallback to `gemini-2.5-flash-lite`), performs two-tier citation verification, and writes back persistent briefing memory.
- **`packages/ingest`**: Headless git miner extracting commits, author personas (with SHA-256 email privacy hashing), file touches, co-change coupling, ADR/RFC frontmatter, temporal supersession windows (`valid_from`, `valid_to`), and git reverts (`[:REVERTS]`).
- **`packages/graph`**: FalkorDB connection layer, openCypher schema definitions, 8 parameterized named queries, and local Transformers.js EmbeddingGemma-2 512-d Matryoshka embeddings on Node.js CPU.

---

## 🚀 Quick Start

### Prerequisites
- Node.js $\ge 22.0.0$
- `pnpm` $\ge 9.0.0$
- Docker (for local FalkorDB instance)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/zeph/argon.git
cd argon
pnpm install
```

### 2. Start FalkorDB

```bash
docker run -p 6379:6379 -it --rm falkordb/falkordb:latest
```

### 3. Initialize Schema & Ingest a Repository

```bash
# Ingest local or remote repository into FalkorDB
pnpm --filter @argon/ingest build
pnpm --filter @argon/ingest ingest --repo https://github.com/ember-learn/deprecation-app.git --workspace ember-adr-showcase
```

### 4. Run Development Web Interface

```bash
pnpm --filter web dev
```

Visit [http://localhost:3000](http://localhost:3000) to explore the 2077 Cyberpunk interface.

---

## 🎨 Frontend Features (`apps/web`)

- **Resizable Split Viewport (`SplitViewport`)**: ~45% continuous briefing stream on the left, ~55% interactive Cytoscape canvas on the right, with one-click pane collapse.
- **2077 Brutalist Styling**: High-contrast Cyberpunk aesthetic using monospace typography, `#00f0ff` (Cyan), `#ffb800` (Gold), `#ff0055` (Crimson), and `#0a0c10` (Void Black).
- **Dual-Invocation Command Bar (`CommandBar`, `CommandDialog`)**: Header input and centered `Cmd+K` palette powered by `cmdk`.
- **Guest Workspace Switcher & Ingest Modal**: Switch between preloaded showcase datasets (`ember-adr-showcase`, `astro-showcase`, `synthetic-monorepo`) or submit new repositories with SSRF protections.
- **Contributor Identity Selector ("Who am I")**: Persona picker for personalized blast radius and blast warnings.
- **Evidence Cards**: Color-coded badges (`DECISION`, `COMPONENT`, `FILE`, `PERSON`), exact FalkorDB `#id` references, temporal validity indicators (`VALID IN FORCE` vs `SUPERSEDED`), and "Focus in Graph" triggers.
- **Interactive Cytoscape.js Canvas**:
  - `fcose` physics layout.
  - Multi-level reactive highlighting (pulsing hovered node/neighbors and dimming background to 20% opacity).
  - Bidirectional focus (clicking in-canvas node shows attributes and scrolls the left panel to the citing claim).
  - Animated Traversal March along multi-hop edges.
  - Floating Cyber HUD (Zoom, Fit View, Re-run Layout, Subgraph Filter, Export Snapshot).
  - "No graph, no answer" Kill Switch hero card on integrity or timeout failure.

---

## 🧪 Testing & Verification

Argon maintains 100% green test coverage across all packages:

```bash
# Run all unit and integration tests across monorepo
pnpm test

# Typecheck all packages
pnpm -r typecheck

# Build web application production bundle
pnpm --filter web build
```

---

## 🔒 Security & ASVS Controls

- **SSRF Defense**: Ingest URL validation blocks loopback, link-local, and RFC 1918 private CIDR blocks.
- **Prompt Injection Defense**: Raw repository and claim data are quarantined within `<EVIDENCE>` boundary tags.
- **Privacy Hashing**: Committer email addresses are irreversibly hashed using SHA-256 before storage in FalkorDB.
- **Fail-Closed Gateways**: Missing or malformed gateway secrets immediately reject external requests with HTTP 401/500.
- **Memory Leak Protection**: Cytoscape instances and canvas animation timers are strictly cleaned up (`cy.destroy()`, `cancelAnimationFrame`).

---

## 📜 License

Apache-2.0
