# Phase 8: Webhook Receiver & Incremental Sync Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16  
**Phase:** 8-Webhook Receiver & Incremental Sync Engine  
**Areas discussed:** Webhook Ingestion & Signature Verification, Incremental Commit & Graph Mutation, ADR Supersession & Temporal Validity, Real-Time Canvas Sync & Client Notification  

---

## Webhook Ingestion & Signature Verification

### Q1: Endpoint termination and secret management
| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Gateway Endpoint with Global Secret | POST /api/v1/webhooks/github in apps/gateway using GITHUB_WEBHOOK_SECRET env var. Matches existing Cloud Run architecture and keeps heavy graph work off Next.js serverless tier. | ✓ |
| Per-Workspace Webhook Secret in FalkorDB | Store unique webhook secrets on (:Workspace) and route via /api/v1/webhooks/github/:workspaceId. | |
| Next.js Route Handler Proxy | Terminate webhooks at apps/web/app/api/webhooks/github and proxy valid events to apps/gateway. | |

**User's choice:** Dedicated Gateway Endpoint with Global Secret  
**Notes:** Reuses established Cloud Run Direct VPC architecture and centralizes secret management.

### Q2: Delivery idempotency and replay protection
| Option | Description | Selected |
|--------|-------------|----------|
| In-Memory LRU Cache with openCypher MERGE fallback | Cache last 10,000 X-GitHub-Delivery IDs in gateway memory for O(1) deduplication, with openCypher MERGE as fallback. | ✓ |
| Persistent FalkorDB Delivery Tracking | Store (:WebhookDelivery) in the graph database. | |
| Pure openCypher MERGE without Delivery Tracking | Rely solely on openCypher MERGE statements without tracking delivery IDs. | |

**User's choice:** In-Memory LRU Cache with openCypher MERGE fallback  
**Notes:** O(1) fast-path deduplication with database idempotency guarantee across restarts.

### Q3: Webhook events and branch filters
| Option | Description | Selected |
|--------|-------------|----------|
| Default Branch Pushes + Merged PRs | Process push events targeting default branch and pull_request events when action === 'closed' && merged === true. | ✓ |
| All Branch Pushes + Active PR Synchronize | Track commits from all branch pushes and active PRs. | |
| Merged Pull Requests Only | Only trigger sync on merged PRs, ignoring push events. | |

**User's choice:** Default Branch Pushes + Merged PRs  
**Notes:** Prevents graph pollution from transient experimental branches while keeping main branch authoritative.

### Q4: Webhook acknowledgment and execution lifecycle
| Option | Description | Selected |
|--------|-------------|----------|
| Synchronous HMAC Verification + Async Background Job | Verify HMAC and delivery ID synchronously; return HTTP 202 Accepted (<50ms) and process mutations asynchronously via FalkorDB IngestJob. | ✓ |
| Fully Synchronous 200 OK Response | Complete all mutations and embeddings inline before responding 200 OK. | |
| Threshold Hybrid | Process synchronously if commits.length <= 5; otherwise return 202 Accepted. | |

**User's choice:** Synchronous HMAC Verification + Async Background Job  
**Notes:** Eliminates GitHub 10s webhook timeout risks under heavy pushes.

---

## Incremental Commit & Graph Mutation

### Q1: Commit and file change retrieval without full re-cloning
| Option | Description | Selected |
|--------|-------------|----------|
| Webhook Payload-First + GitHub Octokit Fallback | Extract commit SHAs, authors, timestamps, and touched file paths directly from webhook commits[] array; use Octokit repos.getContent() only when file blobs (e.g. ADRs) are needed. | ✓ |
| Octokit compareCommits API | Call Octokit repos.compareCommitsWithBasehead() for every push. | |
| Persistent Local Git Cache with git fetch | Maintain bare git cache on disk, running git fetch origin. | |

**User's choice:** Webhook Payload-First + GitHub Octokit Fallback  
**Notes:** Zero disk overhead, zero git subprocesses, and minimum API calls.

### Q2: openCypher incremental mutation structure
| Option | Description | Selected |
|--------|-------------|----------|
| Atomic openCypher UNWIND Batch Query | Single parameterized query (INCREMENTAL_SYNC_COMMITS) unwinding commits/touches, merging nodes and running identity linking in one transaction. | ✓ |
| Multi-Step Staged Cypher Operations | Sequential separate queries for persons, commits, files, touches, and identity linking. | |
| Ingest Pipeline Sub-Runner | Instantiate the full packages/ingest Pipeline with an incremental slice configuration. | |

**User's choice:** Atomic openCypher UNWIND Batch Query  
**Notes:** Guarantees zero partial graph states and executes in <10ms.

### Q3: Co-change coupling update strategy
| Option | Description | Selected |
|--------|-------------|----------|
| Rolling Pairwise Coupling Increment | For commits touching <= 50 files, incrementally update [:CO_CHANGES_WITH] edges by incrementing count and weight. | ✓ |
| Defer Coupling Recalculation | Only ingest commits and touches in real time; defer coupling calculation to maintenance jobs. | |
| Full Workspace Co-Change Matrix Recompute | Recalculate entire workspace co-change matrix on every push. | |

**User's choice:** Rolling Pairwise Coupling Increment  
**Notes:** Keeps blast-radius queries fresh without O(N^2) full-graph recalculation overhead.

### Q4: File deletion and revert modeling
| Option | Description | Selected |
|--------|-------------|----------|
| Track File Lifecycle (deleted: true) & Mine REVERTS Edges | Mark (:File { deleted: true, deleted_at: timestamp }) on removal, and apply revert regex to link (:Commit)-[:REVERTS]->(:Commit). | ✓ |
| Permanent Nodes without Lifecycle Flags | Retain nodes without deletion flags or revert detection. | |
| Tombstone Node Pruning | Detach and delete (:File) nodes and relationships on removal. | |

**User's choice:** Track File Lifecycle (deleted: true) & Mine REVERTS Edges  
**Notes:** Preserves complete git history and historical revert integrity for briefing queries.

---

## ADR Supersession & Temporal Validity

### Q1: ADR detection in merged PRs
| Option | Description | Selected |
|--------|-------------|----------|
| PR File Diff Inspection via Octokit pulls.listFiles() | Query pulls.listFiles() for markdown files matching ADR globs; fetch content via repos.getContent() and parse with packages/ingest/src/mining/adr.ts. | ✓ |
| PR Commit Message & Body Heuristic Mining | Mine decision metadata only from PR title, body, and commits. | |
| Full Workspace ADR Directory Re-index | Re-scan and parse all files in workspace ADR directory on every merged PR. | |

**User's choice:** PR File Diff Inspection via Octokit pulls.listFiles()  
**Notes:** Targeted and lightweight; ignores PRs with zero ADR changes.

### Q2: Temporal validity window advancement in FalkorDB
| Option | Description | Selected |
|--------|-------------|----------|
| PR Merge Timestamp Window Advancement | Set old Decision's valid_to = pr.merged_at, set new Decision's valid_from = pr.merged_at, and create (new)-[:SUPERSEDES]->(old). | ✓ |
| Commit Author Timestamp | Set valid_to and valid_from to git commit author dates. | |
| Discrete Status Flag Mutation | Update old Decision's status = 'superseded' but leave valid_to unchanged. | |

**User's choice:** PR Merge Timestamp Window Advancement  
**Notes:** Mathematically accurate for temporal range queries (valid_from <= asOf < valid_to).

### Q3: ADR embedding generation
| Option | Description | Selected |
|--------|-------------|----------|
| Inline In-Process Embedding in Async Sync Worker | Use EmbeddingGemma-2 512-d CPU pipeline within async sync job (~150ms). | ✓ |
| Deferred Asynchronous Embedding Queue | Ingest with needs_embedding: true and backfill later via background loop. | |
| Pure Keyword/Structural Ingestion without Embeddings | Skip vector embeddings for incrementally synced ADRs. | |

**User's choice:** Inline In-Process Embedding in Async Sync Worker  
**Notes:** Immediate vector retrieval availability with negligible latency on CPU.

### Q4: ADR governance linking
| Option | Description | Selected |
|--------|-------------|----------|
| Dual Governance Mining (Explicit Regex + PR Co-Changed Fallback) | Extract explicit file paths from ADR text; if none cited, link (:Decision)-[:GOVERNS]->(:File) to all files modified in the PR. | ✓ |
| Strict Explicit Paths Only | Only link files explicitly mentioned by relative path in the ADR text. | |
| Directory Scope Governance | Link to all files residing under the directory paths touched by the PR. | |

**User's choice:** Dual Governance Mining (Explicit Regex + PR Co-Changed Fallback)  
**Notes:** Guarantees zero orphan decisions while prioritizing author-specified file targets.

---

## Real-Time Canvas Sync & Client Notification

### Q1: Real-time event transport protocol
| Option | Description | Selected |
|--------|-------------|----------|
| Server-Sent Events (SSE) with Workspace Isolation | GET /api/v1/workspaces/:workspaceId/events in apps/gateway using native HTTP SSE, verified by Phase 6 tenant JWT authorization. | ✓ |
| Full-Duplex WebSockets (ws://) | Implement WebSocket server with client reconnect and ping/pong framing. | |
| Short-Interval SWR Polling | Poll sync status endpoint every 3-5 seconds from web client. | |

**User's choice:** Server-Sent Events (SSE) with Workspace Isolation  
**Notes:** Minimal serverless complexity, standard HTTP streaming, native browser support.

### Q2: SSE event schema
| Option | Description | Selected |
|--------|-------------|----------|
| Structured Delta Event (sync:complete with Affected Node IDs) | Emit sync:complete with exact node IDs ({ commits, files, decisions, superseded }). | ✓ |
| Coarse Workspace Invalidation Event | Emit minimal { type: 'workspace:invalidated' } and trigger full client refetch. | |
| Raw GitHub Payload Pass-Through | Forward raw webhook payload to web client. | |

**User's choice:** Structured Delta Event (sync:complete with Affected Node IDs)  
**Notes:** Enables precise Cytoscape node animations without jarring canvas layout re-runs.

### Q3: Visual sync pulse & HUD feedback
| Option | Description | Selected |
|--------|-------------|----------|
| Dual Canvas Neon Ripple + Monospace HUD Sync Badge | In Cytoscape, animate cyan/amber ring pulse on updated nodes and dashed borders on superseded ADRs; show temporary HUDControls badge. | ✓ |
| Toast Notification with Click-to-Focus | Display toast notification in corner with focus button. | |
| Subtle Outline Flash Only | Flash node borders in emerald/cyan for 600ms without HUD text. | |

**User's choice:** Dual Canvas Neon Ripple + Monospace HUD Sync Badge  
**Notes:** Seamless match with Argon's dark brutalist aesthetic.

### Q4: In-memory Cytoscape merge & briefing invalidation
| Option | Description | Selected |
|--------|-------------|----------|
| Non-Destructive cy.add() Merge + Stale Briefing Alert Banner | Merge new elements via cy.add() with localized placement; show alert banner in BriefingView if cited nodes were updated. | ✓ |
| Full Canvas Graph Re-Query with Auto-Rebrief | Full refetch and layout re-run + automatic briefing re-generation. | |
| Incremental cy.add() without Briefing Invalidation | Add nodes to Cytoscape silently, leaving briefing view unchanged. | |

**User's choice:** Non-Destructive cy.add() Merge + Stale Briefing Alert Banner  
**Notes:** Preserves user viewport state while safeguarding citation integrity in active briefings.

---

## the agent's Discretion

- Exact easing curve parameters and duration for the Cytoscape expanding ring pulse animation (default 1200ms cubic-bezier).
- Internal structured log format for webhook receipt and sync job completion.
- Exact regex pattern list for detecting ADR markdown file paths across varying repository conventions.

## Deferred Ideas

- **ORG-01 (v3.0):** Multi-user organization team spaces with role-based access control.
- **CROSS-01 (v3.0):** Cross-repository multi-graph dependency and shared library impact analysis.
- **SLACK-01 (v3.0):** Slack bot integration triggering Argon briefings directly from PR comments.
