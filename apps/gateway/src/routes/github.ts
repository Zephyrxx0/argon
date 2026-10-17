import { Hono } from 'hono';
import type { ArgonGraphClient } from '@argon/graph';
import { checkWorkspaceAccess, setUserWorkspaceAccess } from '@argon/graph';
import { randomUUID } from 'node:crypto';
import { IngestLimiter, effectiveJob, parsePublicRepoUrl, publicWorkspaceId } from '../services/public-ingest.js';
import { GitHubUserService } from '../services/github-user.js';
import { ErrorCodes, type GatewayErrorResponse, type JwtAuthUser } from '../types.js';

/** Reads the user's GitHub OAuth token off the verified JWT (set by the web app's jwt plugin). */
function userToken(user: JwtAuthUser | undefined): string | undefined {
  return (
    (user as any)?.userAccessToken ||
    (user as any)?.githubAccessToken ||
    (user as any)?.accessToken ||
    undefined
  );
}

export interface PublicIngestParams {
  repoUrl: string;
  repositoryFullName: string;
  workspaceId: string;
  jobId: string;
  userId: string;
  /** Must be called when the job ends (success or failure) to free the user's slot. */
  release: () => void;
}

export interface PrivateIngestParams {
  repoUrl: string;
  repositoryFullName: string;
  /** The caller's GitHub OAuth token, used to clone the (possibly private) repo. */
  accessToken: string;
  workspaceId: string;
  jobId: string;
  userId: string;
  userLogin?: string;
  userEmails?: string[];
  release: () => void;
}

export interface GitHubRouteOptions {
  onIngestPublic?: (params: PublicIngestParams) => Promise<void> | void;
  onIngest?: (params: PrivateIngestParams) => Promise<void> | void;
  ingestLimiter?: IngestLimiter;
}

export function githubRoute(
  githubUserService: GitHubUserService,
  graphClient?: ArgonGraphClient,
  options?: GitHubRouteOptions
): Hono {
  const router = new Hono();
  const limiter = options?.ingestLimiter ?? new IngestLimiter();

  /**
   * GET /repositories - every repository the signed-in user can access (public + private,
   * personal + org), listed with their own OAuth token. No GitHub App installation required.
   */
  router.get('/repositories', async (c) => {
    const user = (c.get as any)('user') as JwtAuthUser | undefined;
    if (!user || user.isAnonymous) {
      return c.json<GatewayErrorResponse>(
        { error: 'Authentication required to list your repositories', code: ErrorCodes.UNAUTHORIZED },
        401
      );
    }
    const token = userToken(user);
    if (!token) {
      return c.json<GatewayErrorResponse>(
        {
          error: 'No GitHub access token on your session. Sign in with GitHub to list your repositories.',
          code: ErrorCodes.UNAUTHORIZED,
        },
        401
      );
    }

    try {
      const repositories = await githubUserService.listUserRepositories(token);
      return c.json({ repositories });
    } catch (err: any) {
      const status = err?.status === 401 ? 401 : 500;
      return c.json<GatewayErrorResponse>(
        {
          error: err?.message || 'Failed to list GitHub repositories',
          code: status === 401 ? ErrorCodes.UNAUTHORIZED : ErrorCodes.INTERNAL_ERROR,
        },
        status
      );
    }
  });

  /**
   * POST /ingest - Ingest one of the caller's own repositories (public or private) using their
   * OAuth token to clone. Authorization = the user's token can read the repo.
   */
  router.post('/ingest', async (c) => {
    const user = (c.get as any)('user') as JwtAuthUser | undefined;
    if (!user?.userId || user.isAnonymous) {
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

    const repositoryFullName = typeof body?.repositoryFullName === 'string' ? body.repositoryFullName.trim() : '';
    const parts = repositoryFullName.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return c.json<GatewayErrorResponse>(
        { error: 'repositoryFullName must be "owner/repo"', code: ErrorCodes.VALIDATION_ERROR },
        400
      );
    }
    const [owner, repo] = parts as [string, string];

    const token = userToken(user);
    if (!token || !graphClient || !options?.onIngest) {
      return c.json<GatewayErrorResponse>(
        {
          error: !token
            ? 'No GitHub access token on your session. Sign in with GitHub first.'
            : 'Ingestion is not available on this gateway',
          code: !token ? ErrorCodes.UNAUTHORIZED : ErrorCodes.INTERNAL_ERROR,
        },
        !token ? 401 : 503
      );
    }

    // Authorize by access: the user's token must be able to read the repo (so it is cloneable).
    const meta = await githubUserService.getRepository(token, owner, repo);
    if (!meta) {
      return c.json<GatewayErrorResponse>(
        { error: `Repository '${repositoryFullName}' not found or not accessible with your GitHub account`, code: ErrorCodes.NOT_FOUND },
        404
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

    const workspaceId = publicWorkspaceId(user.userId, owner, repo);
    const jobId = `job_${randomUUID().slice(0, 8)}`;

    try {
      await setUserWorkspaceAccess(graphClient, {
        workspaceId,
        userId: user.userId,
        role: 'owner',
        isPublic: false,
      });

      await options.onIngest({
        repoUrl: meta.htmlUrl,
        repositoryFullName: meta.fullName,
        accessToken: token,
        workspaceId,
        jobId,
        userId: user.userId,
        userLogin: ((user as any).login || (user as any).userLogin || (user as any).name) as string | undefined,
        userEmails: user.email ? [user.email as string] : undefined,
        release: slot.release,
      });
    } catch (err: any) {
      slot.release();
      return c.json<GatewayErrorResponse>(
        { error: err?.message || 'Failed to start ingestion', code: ErrorCodes.INTERNAL_ERROR },
        500
      );
    }

    return c.json({ status: 'queued', workspaceId, jobId, repositoryFullName: meta.fullName, private: meta.private }, 202);
  });

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
