import type { MiddlewareHandler } from 'hono';
import type { ArgonGraphClient } from '@argon/graph';
import { checkWorkspaceAccess, FalkorUnavailableError } from '@argon/graph';
import { ErrorCodes, type GatewayErrorResponse, type JwtAuthUser } from '../types.js';

/**
 * Pre-query FalkorDB tenant authorization guard (D-11, D-12, TENANT-01).
 * Verifies workspace existence and caller authorization before executing queries or briefings.
 */
export function tenantAuthMiddleware(graphClient: ArgonGraphClient): MiddlewareHandler {
  return async (c, next) => {
    // Derive from the path: the generic `/api/v1/:workspaceId/*` guard also matches
    // `/api/v1/workspaces/<id>/...`, where the route param would be the literal "workspaces".
    const parts = c.req.path.split('/');
    const workspaceId = parts[3] === 'workspaces' ? parts[4] : parts[3];

    if (!workspaceId) {
      return await next();
    }

    const user = c.get('user') as JwtAuthUser | undefined;

    // Internal admin / test harness bypass for static secret callers
    if (user?.userId === 'admin') {
      return await next();
    }

    const userId = user?.userId || 'anonymous';

    try {
      const access = await checkWorkspaceAccess(graphClient, workspaceId, userId);

      if (!access.exists) {
        const errorResponse: GatewayErrorResponse = {
          error: `Workspace '${workspaceId}' not found`,
          code: ErrorCodes.NOT_FOUND,
        };
        return c.json(errorResponse, 404);
      }

      if (!access.allowed) {
        const errorResponse: GatewayErrorResponse = {
          error: 'Workspace access denied',
          code: ErrorCodes.FORBIDDEN,
        };
        return c.json(errorResponse, 403);
      }

      await next();
    } catch (err: any) {
      if (
        err instanceof FalkorUnavailableError ||
        err?.message?.includes('FalkorDB is unavailable') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.code === 'ECONNREFUSED'
      ) {
        const errorResponse: GatewayErrorResponse = {
          error: 'FalkorDB is unreachable',
          code: ErrorCodes.FALKORDB_UNREACHABLE,
        };
        return c.json(errorResponse, 503);
      }

      // FalkorDB raises this when the per-workspace graph key does not exist
      if (err?.message?.includes('empty key')) {
        const errorResponse: GatewayErrorResponse = {
          error: `Workspace '${workspaceId}' not found`,
          code: ErrorCodes.NOT_FOUND,
        };
        return c.json(errorResponse, 404);
      }

      const errorResponse: GatewayErrorResponse = {
        error: 'Internal authorization error',
        code: ErrorCodes.INTERNAL_ERROR,
      };
      return c.json(errorResponse, 500);
    }
  };
}
