# Plan 08-03 Summary: Real-Time SSE Stream, Cytoscape Neon Sync Pulse & UI Invalidation

**Execution Wave:** Wave 3  
**Requirements Addressed:** `SYNC-03`  
**Status:** Completed  

---

## 1. Accomplishments

### Workspace-Scoped Server-Sent Events (SSE) Streaming (`@argon/gateway`)
- Created `apps/gateway/src/services/event-broadcaster.ts` (`EventBroadcaster`):
  - Manages in-memory workspace-scoped listeners with strict tenant isolation.
  - Implements `subscribe(workspaceId, listener)` with automatic set cleanup on disconnect.
  - Implements `broadcast(workspaceId, event, data)` to deliver incremental synchronization events.
- Created `apps/gateway/src/routes/events.ts` (`eventsRoute`):
  - Exposes `GET /api/v1/workspaces/:workspaceId/events` using Hono's `streamSSE`.
  - Sends initial `: connected\n\n` greeting and 15-second `: heartbeat\n\n` keepalive comments.
  - Enforces Phase 6 tenant JWT authorization and FalkorDB workspace access checks (`tenantAuthMiddleware`), preventing unauthorized callers from eavesdropping on private repository events (T-08-09).
  - Unsubscribes listeners and clears heartbeat timers on client abort/disconnect, preventing connection leaks (T-08-10).
- Updated `apps/gateway/src/middleware/jwt.ts`:
  - Extended token resolution to accept query parameter `?token=<jwt>` in addition to standard `Authorization: Bearer <token>` headers, enabling browser-native `EventSource` authentication.
- Updated `apps/gateway/src/services/incremental-sync.ts`:
  - Broadcasts `sync:complete` event with affected node IDs (`{ commits, files, decisions, superseded }`) upon sync finish.
- Tested in `apps/gateway/test/routes/events.test.ts` (6/6 tests passing).

### Client EventSource Listener & Live Cytoscape Pulse (`apps/web`)
- Created `apps/web/lib/events-client.ts`:
  - Provides `createWorkspaceEventSource(workspaceId, options)` connecting to `/api/v1/workspaces/:workspaceId/events` with token query parameter.
  - Features exponential backoff reconnect logic (1s up to 15s) with clean handle disposal.
- Updated `apps/web/lib/graph-sync.tsx`:
  - Unified interactive node hover/selection/focus state with live SSE sync state in `GraphSyncProvider` and `useGraphSync()`.
  - Exposes `lastSyncEvent`, `isSyncing`, `syncBadgeText`, and subscriber dispatch for canvas/briefing.
  - Computes monospace badge text (e.g. `LIVE SYNC • +2 commits, 1 ADR superseded`) with auto-dismiss timer (5s).
- Updated `apps/web/components/canvas/stylesheet.ts`:
  - Added `.synced-pulse` selector (neon cyan glow, 5px border, 1.2s transition).
  - Added `.superseded-adr` selector (opacity 0.4, dashed border, danger amber/red color).
- Updated `apps/web/components/canvas/cytoscape-canvas.tsx`:
  - Listens to `lastSyncEvent`, dynamically highlighting updated node IDs with `.synced-pulse` for 2 seconds.
  - Applies `.superseded-adr` styling to superseded decisions without triggering destructive layout re-computation or camera jitter (T-08-11).
- Tested in `apps/web/tests/graph-sync.test.tsx` and `apps/web/tests/cytoscape-style.test.ts` (9/9 tests passing).

### Monospace HUD Badge & Active Briefing Stale Citations Alert
- Updated `apps/web/components/canvas/hud-controls.tsx`:
  - Consumes `useGraphSync()` to render a cyber-brutalist monospace badge `● LIVE SYNC • +N commits, N ADR superseded` with glowing cyan indicator dot.
  - Auto-fades smoothly after 5 seconds.
- Updated `apps/web/components/briefing/briefing-view.tsx`:
  - Inspects active briefing's cited node IDs across all sections and verified evidence.
  - Detects if any cited node ID was updated or superseded by an incoming `sync:complete` event.
  - Displays non-blocking alert banner: *"Repository updated since briefing was generated. Citations may be stale."* with `[Re-Run Briefing]` action button.
- Tested in `apps/web/tests/components/sync-pulse-canvas.test.tsx` (5/5 tests passing).

---

## 2. Verification

- `@argon/gateway`: 12 test suites, 76/76 tests passing (`pnpm --filter @argon/gateway test`).
- `web`: 20 test suites, 86/86 tests passing (`pnpm --filter web test`).
- Workspace-wide (`pnpm test`): 9 out of 9 workspace projects passing, 100% green.
- Typecheck: `tsc --noEmit` cleanly passing across gateway and web.
