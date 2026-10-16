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

export interface GatewayAppOptions {
  graphClient?: ArgonGraphClient;
  gatewaySecret?: string;
  webhookSecret?: string;
  queryTimeoutMs?: number;
  briefingOptions?: BriefingRouteOptions;
  githubAppService?: GitHubAppService;
  githubRouteOptions?: GitHubRouteOptions;
  webhooksOptions?: WebhooksRouteOptions;
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
  const ghRoute = githubRoute(githubApp, options?.graphClient, options?.githubRouteOptions);
  app.route('/api/v1/github', ghRoute);
  app.route('/api/v1/workspaces', ghRoute);

  // Webhook receiver routes
  const whRoute = webhooksRoute({
    graphClient: options?.graphClient,
    webhookSecret: options?.webhookSecret,
    ...options?.webhooksOptions,
  });
  app.route('/api/v1/webhooks', whRoute);

  // Pre-query tenant authorization guard and named query routes under /api/v1
  if (options?.graphClient) {
    app.use('/api/v1/:workspaceId/*', tenantAuthMiddleware(options.graphClient));
    app.route('/api/v1', queryRoute(options.graphClient, { timeoutMs: options?.queryTimeoutMs }));
    app.route('/api/v1', briefingRoute(options.graphClient, options.briefingOptions));
  }

  return app;
}
