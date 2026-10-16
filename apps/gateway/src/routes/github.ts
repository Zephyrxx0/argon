import { Hono } from 'hono';
import type { ArgonGraphClient } from '@argon/graph';
import { setUserWorkspaceAccess } from '@argon/graph';
import type { GitHubAppService } from '../services/github-app.js';
import { ErrorCodes, type GatewayErrorResponse, type JwtAuthUser } from '../types.js';

export interface GitHubRouteOptions {
  onIngest?: (params: {
    repositoryFullName: string;
    installationId: number;
    installationToken: string;
    workspaceId: string;
    userId: string;
  }) => Promise<void> | void;
}

export function githubRoute(
  githubAppService: GitHubAppService,
  graphClient?: ArgonGraphClient,
  options?: GitHubRouteOptions
): Hono {
  const router = new Hono();

  /**
   * GET /repositories - Lists accessible repositories for the authenticated user (D-09, D-10)
   */
  router.get('/repositories', async (c) => {
    const user = (c.get as any)('user') as JwtAuthUser | undefined;

    if (!user || user.isAnonymous) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Authentication required to list private repositories',
        code: ErrorCodes.UNAUTHORIZED,
      };
      return c.json(errorResponse, 401);
    }

    try {
      const installationIdParam = c.req.query('installationId');
      const targetInstallationId = installationIdParam ? Number(installationIdParam) : undefined;
      const userAccessToken = (user as any).githubAccessToken || (user as any).accessToken;

      const repositories = await githubAppService.getUserRepositories(
        userAccessToken,
        targetInstallationId
      );

      return c.json({ repositories });
    } catch (err: any) {
      const errorResponse: GatewayErrorResponse = {
        error: err?.message || 'Failed to list GitHub repositories',
        code: ErrorCodes.INTERNAL_ERROR,
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /ingest - Dispatches authenticated private repository ingestion with dual verification (D-04, T-07-04)
   */
  router.post('/ingest', async (c) => {
    const user = (c.get as any)('user') as JwtAuthUser | undefined;

    if (!user || user.isAnonymous) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Authentication required to initiate ingestion',
        code: ErrorCodes.UNAUTHORIZED,
      };
      return c.json(errorResponse, 401);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      const errorResponse: GatewayErrorResponse = {
        error: 'Malformed JSON payload',
        code: ErrorCodes.VALIDATION_ERROR,
      };
      return c.json(errorResponse, 400);
    }

    if (!body || typeof body.repositoryFullName !== 'string' || typeof body.installationId !== 'number') {
      const errorResponse: GatewayErrorResponse = {
        error: 'Missing required parameters: repositoryFullName (string) and installationId (number)',
        code: ErrorCodes.VALIDATION_ERROR,
      };
      return c.json(errorResponse, 400);
    }

    const { repositoryFullName, installationId } = body;
    const userAccessToken = (user as any).githubAccessToken || (user as any).accessToken;

    // Dual Authorization verification check (D-04, T-07-04)
    const isAuthorized = await githubAppService.verifyUserInstallation(
      user.userId,
      installationId,
      userAccessToken
    );

    if (!isAuthorized) {
      const errorResponse: GatewayErrorResponse = {
        error: 'User is not authorized for this GitHub App installation',
        code: ErrorCodes.FORBIDDEN,
      };
      return c.json(errorResponse, 403);
    }

    try {
      // Mint short-lived installation token kept in-memory
      const installationToken = await githubAppService.getInstallationToken(installationId);
      const workspaceId = body.workspaceId || repositoryFullName.replace('/', '-').toLowerCase();

      // Ensure FalkorDB workspace ownership & access records (TENANT-01, TENANT-02)
      if (graphClient) {
        await setUserWorkspaceAccess(graphClient, {
          workspaceId,
          userId: user.userId,
          role: 'owner',
          isPublic: false,
        });
      }

      // Invoke async ingestion callback if wired
      if (options?.onIngest) {
        await options.onIngest({
          repositoryFullName,
          installationId,
          installationToken,
          workspaceId,
          userId: user.userId,
        });
      }

      return c.json({
        status: 'queued',
        workspaceId,
        repositoryFullName,
        installationId,
      });
    } catch (err: any) {
      const errorResponse: GatewayErrorResponse = {
        error: err?.message || 'Failed to dispatch repository ingestion',
        code: ErrorCodes.INTERNAL_ERROR,
      };
      return c.json(errorResponse, 500);
    }
  });

  return router;
}
