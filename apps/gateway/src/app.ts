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
import { GitHubAppService } from './services/github-app.js';
import { webhooksRoute, type WebhooksRouteOptions } from './routes/webhooks.js';
import { eventsRoute, type EventsRouteOptions } from './routes/events.js';
import { IncrementalSyncService } from './services/incremental-sync.js';
import { syncOrchestrator } from './services/sync-orchestrator.js';
import { runIngestion } from '@argon/ingest';

export interface GatewayAppOptions {
  graphClient?: ArgonGraphClient;
  gatewaySecret?: string;
  webhookSecret?: string;
  queryTimeoutMs?: number;
  briefingOptions?: BriefingRouteOptions;
  githubAppService?: GitHubAppService;
  githubRouteOptions?: GitHubRouteOptions;
  webhooksOptions?: WebhooksRouteOptions;
  incrementalSyncService?: IncrementalSyncService;
  eventsOptions?: EventsRouteOptions;
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

  // GitHub App repository and ingestion routes
  const githubApp = options?.githubAppService ?? new GitHubAppService();

  const defaultOnIngest = async (payload: {
    repositoryFullName: string;
    installationId: number;
    installationToken: string;
    workspaceId: string;
    userId: string;
    userLogin?: string;
    userEmails?: string[];
  }) => {
    runIngestion({
      repoUrl: `https://github.com/${payload.repositoryFullName}`,
      workspaceId: payload.workspaceId,
      installationToken: payload.installationToken,
      client: options?.graphClient,
      userId: payload.userId,
      userLogin: payload.userLogin,
      userEmails: payload.userEmails,
    }).catch((err) => {
      console.error(`[gateway:ingest] Ingestion failed for ${payload.repositoryFullName}:`, err);
    });
  };

  const githubRouteOptions: GitHubRouteOptions = {
    onIngest: options?.githubRouteOptions?.onIngest ?? defaultOnIngest,
    ...options?.githubRouteOptions,
  };
  const ghRoute = githubRoute(githubApp, options?.graphClient, githubRouteOptions);
  app.route('/api/v1/github', ghRoute);
  app.route('/api/v1/workspaces', ghRoute);

  // Webhook receiver routes and sync runner
  const incrementalSync =
    options?.incrementalSyncService ??
    new IncrementalSyncService({
      graphClient: options?.graphClient,
      githubAppService: githubApp,
    });
  syncOrchestrator.registerRunner((jobId, event, payload, workspaceId) =>
    incrementalSync.sync(jobId, event, payload, workspaceId),
  );

  const whRoute = webhooksRoute({
    graphClient: options?.graphClient,
    webhookSecret: options?.webhookSecret,
    ...options?.webhooksOptions,
  });
  app.route('/api/v1/webhooks', whRoute);

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
