import { NextRequest, NextResponse } from 'next/server';
import type { ArgonGraphClient } from '@argon/graph';

export const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Reads the caller's user id from a Bearer JWT; falls back to 'anonymous' (public showcase access only). */
async function resolveUserId(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return 'anonymous';
  try {
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(
      process.env.BETTER_AUTH_SECRET || 'argon-dev-secret-at-least-32-chars-long'
    );
    const verified = await jwtVerify(authHeader.slice(7), secret);
    return (
      (verified.payload.userId as string) || (verified.payload.sub as string) || 'anonymous'
    );
  } catch {
    return 'anonymous';
  }
}

function isUnavailable(err: unknown): boolean {
  const e = err as { name?: string; message?: string; code?: string } | null;
  const message = e?.message ?? '';
  return (
    e?.name === 'FalkorUnavailableError' ||
    e?.code === 'ECONNREFUSED' ||
    message.includes('ECONNREFUSED') ||
    message.includes('timeout') ||
    message.includes('SocketClosed') ||
    message.includes('unreachable')
  );
}

/**
 * Runs `handler` against a connected graph client, after enforcing the same tenant
 * rules as /api/briefing: workspace must exist (404) and the caller must have access (403).
 * Fails closed with 503 when FalkorDB is unreachable ("no graph, no answer").
 */
export async function withAuthorizedWorkspace(
  req: NextRequest,
  workspaceId: string,
  handler: (client: ArgonGraphClient) => Promise<NextResponse>
): Promise<NextResponse> {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Invalid workspaceId format' },
      { status: 400 }
    );
  }

  const { ArgonGraphClient, checkWorkspaceAccess } = await import('@argon/graph');
  const client = new ArgonGraphClient();

  try {
    await client.connect();
    const userId = await resolveUserId(req);
    const access = await checkWorkspaceAccess(client, workspaceId, userId);

    if (!access.exists) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Workspace '${workspaceId}' not found` },
        { status: 404 }
      );
    }
    if (!access.allowed) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Workspace access denied' },
        { status: 403 }
      );
    }
    return await handler(client);
  } catch (err) {
    // FalkorDB raises this when the per-workspace graph key does not exist
    if (((err as Error)?.message ?? '').includes('empty key')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Workspace '${workspaceId}' not found` },
        { status: 404 }
      );
    }
    if (isUnavailable(err)) {
      return NextResponse.json(
        {
          status: 'FALKORDB_TIMEOUT',
          reason: 'FalkorDB Graph Unreachable (503): No graph, no answer.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error)?.message ?? 'Unknown server error' },
      { status: 500 }
    );
  } finally {
    await client.close();
  }
}
