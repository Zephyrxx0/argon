import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ArgonGraphClient } from '@argon/graph';
import { jwtAuthMiddleware } from './middleware/jwt.js';
import { tenantAuthMiddleware } from './middleware/tenant-auth.js';
import { healthRoute } from './routes/health.js';
import { queryRoute } from './routes/query.js';
import { briefingRoute, type BriefingRouteOptions } from './routes/briefing.js';
import { githubRoute, type GitHubRouteOptions } from './routes/github.js';
import { GitHubUserService } from './services/github-user.js';
import { eventsRoute, type EventsRouteOptions } from './routes/events.js';
import { eventBroadcaster } from './services/event-broadcaster.js';
import { runIngestion, type IngestSummary } from '@argon/ingest';

export interface GatewayAppOptions {
  graphClient?: ArgonGraphClient;
  gatewaySecret?: string;
  queryTimeoutMs?: number;
  briefingOptions?: BriefingRouteOptions;
  githubUserService?: GitHubUserService;
  githubRouteOptions?: GitHubRouteOptions;
  eventsOptions?: EventsRouteOptions;
}

const PUBLIC_INGEST_MAX_COMMITS = 500;

/**
 * Tells live subscribers what an ingestion changed, so open briefings that cite a changed file or
 * a superseded decision can show the "repository updated" banner.
 */
function broadcastSync(workspaceId: string, summary: IngestSummary): void {
  eventBroadcaster.broadcast(workspaceId, 'sync:complete', {
    workspaceId,
    updated: {
      commits: summary.delta.newCommits,
      files: summary.delta.newFiles,
      decisions: summary.delta.newDecisions,
    },
    superseded: summary.delta.supersededDecisions,
  });
}

export function createGatewayApp(options?: GatewayAppOptions): Hono {
  const app = new Hono();

  // Global middleware
  app.use('*', cors());
  app.use('*', logger());

  // Public health check route
  app.route('/health', healthRoute(options?.graphClient));

  // Authenticated API routes with HS256 JWT verification
  app.use('/api/*', jwtAuthMiddleware(options?.gatewaySecret));

  // GitHub repository + ingestion routes, backed by the user's own OAuth token (no App).
  const githubUser = options?.githubUserService ?? new GitHubUserService();

  // Ingest one of the user's own repos (public or private), cloning with their OAuth token.
  const defaultOnIngest: NonNullable<GitHubRouteOptions['onIngest']> = (payload) => {
    runIngestion({
      repoUrl: payload.repoUrl,
      workspaceId: payload.workspaceId,
      jobId: payload.jobId,
      accessToken: payload.accessToken,
      client: options?.graphClient,
      userId: payload.userId,
      userLogin: payload.userLogin,
      userEmails: payload.userEmails,
      depth: PUBLIC_INGEST_MAX_COMMITS,
      maxCommits: PUBLIC_INGEST_MAX_COMMITS,
    })
      .then((summary) => {
        // Keep the live-sync UI meaningful without webhooks: tell subscribers the graph changed.
        broadcastSync(payload.workspaceId, summary);
      })
      .catch((err) => {
        console.error(`[gateway:ingest] Ingestion failed for ${payload.repositoryFullName}:`, err?.message ?? err);
      })
      .finally(payload.release);
  };

  // Public-repo ingestion is bounded: recent history only, so a huge repository cannot
  // pin a worker for minutes. Runs in the background; progress is read via /ingest-status.
  const defaultOnIngestPublic: NonNullable<GitHubRouteOptions['onIngestPublic']> = (payload) => {
    runIngestion({
      repoUrl: payload.repoUrl,
      workspaceId: payload.workspaceId,
      jobId: payload.jobId,
      client: options?.graphClient,
      userId: payload.userId,
      depth: PUBLIC_INGEST_MAX_COMMITS,
      maxCommits: PUBLIC_INGEST_MAX_COMMITS,
    })
      .then((summary) => {
        broadcastSync(payload.workspaceId, summary);
      })
      .catch((err) => {
        console.error(`[gateway:ingest] Public ingestion failed for ${payload.repositoryFullName}:`, err?.message ?? err);
      })
      .finally(payload.release);
  };

  // Re-sync an existing workspace: full git re-mine + GitHub activity since the last completed job.
  const defaultOnRefresh: NonNullable<GitHubRouteOptions['onRefresh']> = (payload) => {
    runIngestion({
      repoUrl: payload.repoUrl,
      workspaceId: payload.workspaceId,
      jobId: payload.jobId,
      accessToken: payload.accessToken,
      client: options?.graphClient,
      userId: payload.userId,
      userLogin: payload.userLogin,
      userEmails: payload.userEmails,
      depth: PUBLIC_INGEST_MAX_COMMITS,
      maxCommits: PUBLIC_INGEST_MAX_COMMITS,
      github: { since: payload.since },
    })
      .then((summary) => {
        broadcastSync(payload.workspaceId, summary);
      })
      .catch((err) => {
        console.error(`[gateway:refresh] Re-sync failed for ${payload.repositoryFullName}:`, err?.message ?? err);
      })
      .finally(payload.release);
  };

  const githubRouteOptions: GitHubRouteOptions = {
    onRefresh: options?.githubRouteOptions?.onRefresh ?? defaultOnRefresh,
    onIngest: options?.githubRouteOptions?.onIngest ?? defaultOnIngest,
    onIngestPublic: options?.githubRouteOptions?.onIngestPublic ?? defaultOnIngestPublic,
    ...options?.githubRouteOptions,
  };
  const ghRoute = githubRoute(githubUser, options?.graphClient, githubRouteOptions);
  app.route('/api/v1/github', ghRoute);
  app.route('/api/v1/workspaces', ghRoute);

  // Pre-query tenant authorization guard under /api/v1
  if (options?.graphClient) {
    app.use('/api/v1/:workspaceId/*', tenantAuthMiddleware(options.graphClient));
    app.use('/api/v1/workspaces/:workspaceId/*', tenantAuthMiddleware(options.graphClient));
  }

  // Live SSE event stream routes
  const evRoute = eventsRoute(options?.eventsOptions);
  app.route('/api/v1', evRoute);

  // Named query routes and briefing routes under /api/v1
  if (options?.graphClient) {
    app.route('/api/v1', queryRoute(options.graphClient, { timeoutMs: options?.queryTimeoutMs }));
    app.route('/api/v1', briefingRoute(options.graphClient, options.briefingOptions));
  }

  return app;
}
