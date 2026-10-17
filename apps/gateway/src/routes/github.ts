import { Hono } from 'hono';
import type { ArgonGraphClient } from '@argon/graph';
import { checkWorkspaceAccess, setUserWorkspaceAccess } from '@argon/graph';
import { randomUUID } from 'node:crypto';
import { IngestLimiter, effectiveJob, parsePublicRepoUrl, publicWorkspaceId } from '../services/public-ingest.js';
import type { GitHubAppService } from '../services/github-app.js';
import { ErrorCodes, type GatewayErrorResponse, type JwtAuthUser } from '../types.js';

export interface PublicIngestParams {
  repoUrl: string;
  repositoryFullName: string;
  workspaceId: string;
  jobId: string;
  userId: string;
  /** Must be called when the job ends (success or failure) to free the user's slot. */
  release: () => void;
}

export interface GitHubRouteOptions {
  onIngestPublic?: (params: PublicIngestParams) => Promise<void> | void;
  ingestLimiter?: IngestLimiter;
  onIngest?: (params: {
    repositoryFullName: string;
    installationId: number;
    installationToken: string;
    workspaceId: string;
    userId: string;
    userLogin?: string;
    userEmails?: string[];
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
      const userAccessToken =
        (user as any).userAccessToken || (user as any).githubAccessToken || (user as any).accessToken;
      const login = ((user as any).login || (user as any).userLogin || (user as any).name) as
        | string
        | undefined;

      const repositories = await githubAppService.getUserRepositories(
        userAccessToken,
        targetInstallationId,
        login
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
    const userAccessToken =
      (user as any).userAccessToken || (user as any).githubAccessToken || (user as any).accessToken;

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
          userLogin: (user.login as string | undefined) || (user.userLogin as string | undefined),
          userEmails: user.email ? [user.email as string] : undefined,
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

  const limiter = options?.ingestLimiter ?? new IngestLimiter();

  /**
   * POST /ingest-public - Starts ingestion of a PUBLIC github.com repository for the caller.
   * Guests may use it; the resulting workspace is private to the creating session/user.
   */
  router.post('/ingest-public', async (c) => {
    const user = (c.get as any)('user') as JwtAuthUser | undefined;
    if (!user?.userId) {
      return c.json<GatewayErrorResponse>(
        { error: 'Authentication required to initiate ingestion', code: ErrorCodes.UNAUTHORIZED },
        401
      );
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json<GatewayErrorResponse>(
        { error: 'Malformed JSON payload', code: ErrorCodes.VALIDATION_ERROR },
        400
      );
    }

    const repo = parsePublicRepoUrl(body?.repoUrl);
    if (!repo.ok) {
      return c.json<GatewayErrorResponse>({ error: repo.error, code: ErrorCodes.VALIDATION_ERROR }, 400);
    }
    if (!graphClient || !options?.onIngestPublic) {
      return c.json<GatewayErrorResponse>(
        { error: 'Ingestion is not available on this gateway', code: ErrorCodes.INTERNAL_ERROR },
        503
      );
    }

    const slot = limiter.tryAcquire(user.userId);
    if ('reason' in slot) {
      return c.json<GatewayErrorResponse>(
        {
          error:
            slot.reason === 'user'
              ? 'You already have an ingestion in progress. Wait for it to finish.'
              : 'The server is busy ingesting other repositories. Try again shortly.',
          code: ErrorCodes.RATE_LIMITED,
        },
        429
      );
    }

    const workspaceId = publicWorkspaceId(user.userId, repo.owner, repo.repo);
    const jobId = `job_${randomUUID().slice(0, 8)}`;

    try {
      // Creates the graph + (:Workspace) + ownership edge before the job starts, so the
      // status endpoint and tenant guard work immediately.
      await setUserWorkspaceAccess(graphClient, {
        workspaceId,
        userId: user.userId,
        role: 'owner',
        isPublic: false,
      });

      await options.onIngestPublic({
        repoUrl: repo.url,
        repositoryFullName: repo.fullName,
        workspaceId,
        jobId,
        userId: user.userId,
        release: slot.release,
      });
    } catch (err: any) {
      slot.release();
      return c.json<GatewayErrorResponse>(
        { error: err?.message || 'Failed to start ingestion', code: ErrorCodes.INTERNAL_ERROR },
        500
      );
    }

    return c.json({ status: 'queued', workspaceId, jobId, repositoryFullName: repo.fullName }, 202);
  });

  /**
   * GET /:workspaceId/ingest-status - Progress of the latest ingestion job for a workspace.
   * Registered before the generic tenant guard, so access is enforced here.
   */
  router.get('/:workspaceId/ingest-status', async (c) => {
    const workspaceId = c.req.param('workspaceId');
    const user = (c.get as any)('user') as JwtAuthUser | undefined;

    if (!graphClient) {
      return c.json<GatewayErrorResponse>(
        { error: 'Graph database unavailable', code: ErrorCodes.INTERNAL_ERROR },
        503
      );
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
      return c.json<GatewayErrorResponse>(
        { error: 'Invalid workspace id', code: ErrorCodes.VALIDATION_ERROR },
        400
      );
    }

    try {
      if (user?.userId !== 'admin') {
        const access = await checkWorkspaceAccess(graphClient, workspaceId, user?.userId || 'anonymous');
        if (!access.exists) {
          return c.json<GatewayErrorResponse>(
            { error: `Workspace '${workspaceId}' not found`, code: ErrorCodes.NOT_FOUND },
            404
          );
        }
        if (!access.allowed) {
          return c.json<GatewayErrorResponse>(
            { error: 'Workspace access denied', code: ErrorCodes.FORBIDDEN },
            403
          );
        }
      }

      const latest = await graphClient.roQuery<Record<string, unknown>>(
        workspaceId,
        `MATCH (j:IngestJob)
         RETURN j.id AS jobId, j.status AS status, j.progress AS progress, j.error AS error,
                j.repo_url AS repoUrl, j.updated_at AS updatedAt
         ORDER BY j.updated_at DESC LIMIT 1`
      );
      const row = (latest.data?.[0] ?? null) as Record<string, any> | null;

      const counts = await graphClient.roQuery<Record<string, unknown>>(
        workspaceId,
        `MATCH (n) WHERE NOT n:IngestJob AND NOT n:Workspace AND NOT n:User AND NOT n:Briefing
         RETURN count(n) AS nodeCount`
      );
      const nodeCount = Number((counts.data?.[0] as any)?.nodeCount ?? 0);

      const job = effectiveJob(row, Math.floor(Date.now() / 1000));

      return c.json({
        workspaceId,
        status: job.status,
        progress: job.progress,
        error: job.error,
        repoUrl: (row?.repoUrl as string | null) ?? null,
        jobId: (row?.jobId as string | null) ?? null,
        nodeCount,
      });
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('empty key')) {
        return c.json<GatewayErrorResponse>(
          { error: `Workspace '${workspaceId}' not found`, code: ErrorCodes.NOT_FOUND },
          404
        );
      }
      return c.json<GatewayErrorResponse>(
        { error: msg || 'Failed to read ingestion status', code: ErrorCodes.INTERNAL_ERROR },
        500
      );
    }
  });

  return router;
}
