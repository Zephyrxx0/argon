import type { ArgonGraphClient } from '../client';

export interface WorkspaceAccessResult {
  exists: boolean;
  allowed: boolean;
}

export interface SetUserWorkspaceAccessParams {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'member' | 'viewer';
  isPublic?: boolean;
}

export interface MigrateGuestAccessParams {
  guestId: string;
  authUserId: string;
  workspaceId?: string;
}

/**
 * Checks if a workspace exists and if a given user has access to it.
 * Uses OPTIONAL MATCH with null check for 100% FalkorDB compatibility (D-11).
 * Avoids unsupported nested EXISTS { MATCH ... } syntax.
 */
export async function checkWorkspaceAccess(
  client: ArgonGraphClient,
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccessResult> {
  const cypher = `
    MATCH (w:Workspace {id: $workspaceId})
    OPTIONAL MATCH (u:User {id: $userId})-[r:ACCESSES]->(w)
    RETURN count(w) > 0 AS exists,
           (w.is_public = true OR r IS NOT NULL) AS allowed;
  `;

  let res;
  try {
    res = await client.roQuery<WorkspaceAccessResult>(workspaceId, cypher, { workspaceId, userId });
  } catch (err: any) {
    // FalkorDB raises this when the per-workspace graph key does not exist at all
    if (String(err?.message ?? '').includes('empty key')) {
      return { exists: false, allowed: false };
    }
    throw err;
  }

  const row = res.data?.[0];
  if (!row) {
    return { exists: false, allowed: false };
  }

  const existsVal = (row as any).exists !== undefined ? (row as any).exists : (row as any)[0];
  const allowedVal = (row as any).allowed !== undefined ? (row as any).allowed : (row as any)[1];

  return {
    exists: Boolean(existsVal),
    allowed: Boolean(allowedVal),
  };
}

/**
 * Creates or updates a workspace, user, and the [:ACCESSES] edge with a specified role.
 * Privacy preserving: (:User) node stores only userId, never email addresses (D-10).
 */
export async function setUserWorkspaceAccess(
  client: ArgonGraphClient,
  params: SetUserWorkspaceAccessParams
): Promise<void> {
  const isPublic = params.isPublic ?? false;
  const cypher = `
    MERGE (w:Workspace {id: $workspaceId})
    SET w.is_public = $isPublic
    MERGE (u:User {id: $userId})
    MERGE (u)-[r:ACCESSES]->(w)
    SET r.role = $role;
  `;

  await client.query(params.workspaceId, cypher, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    role: params.role,
    isPublic,
  });
}

/** Graph used when the client cannot enumerate graphs (e.g. a minimal client): the legacy default. */
const DEFAULT_MIGRATION_GRAPH = 'ember-adr-showcase';

/**
 * Names of every graph (workspace) on the connected FalkorDB. Access edges live inside each
 * workspace's own graph, so a guest's workspaces can only be found by looking at all of them.
 */
async function listWorkspaceGraphs(client: ArgonGraphClient): Promise<string[]> {
  try {
    const raw = typeof client.getRawClient === 'function' ? client.getRawClient() : null;
    if (raw && typeof raw.list === 'function') {
      return (await raw.list()).filter((name) => typeof name === 'string' && name.length > 0);
    }
  } catch {
    // fall through to the default graph
  }
  return [DEFAULT_MIGRATION_GRAPH];
}

const MIGRATE_CYPHER = `
    MATCH (guest:User {id: $guestId})-[r:ACCESSES]->(w:Workspace)
    MERGE (u:User {id: $authUserId})
    MERGE (u)-[r2:ACCESSES]->(w)
    SET r2.role = r.role
    DETACH DELETE guest
    RETURN count(w) AS migratedCount;
  `;

/**
 * Migrates temporary guest ACCESSES edges to the permanent authenticated user upon account
 * linking (D-14), then removes the temporary guest node.
 *
 * The edges live in each workspace's own graph (a guest who ingested a repository owns that
 * workspace there), so every graph is visited, not just the showcase one; otherwise a guest's
 * workspaces would be lost the moment they sign in. Pass `workspaceId` to limit it to one graph.
 * Returns the number of workspaces whose access was moved. A graph that cannot be read is skipped
 * (it never blocks sign-in or the other graphs).
 */
export async function migrateGuestAccess(
  client: ArgonGraphClient,
  params: MigrateGuestAccessParams
): Promise<number> {
  const graphs = params.workspaceId ? [params.workspaceId] : await listWorkspaceGraphs(client);
  let total = 0;

  for (const graph of graphs) {
    try {
      const res = await client.query<{ migratedCount: number }>(graph, MIGRATE_CYPHER, {
        guestId: params.guestId,
        authUserId: params.authUserId,
      });
      const row = res.data?.[0];
      const count = row ? Number((row as any).migratedCount ?? 0) : 0;
      total += count;

      // Clean up a guest node that had no ACCESSES edge in this graph
      if (count === 0) {
        await client
          .query(graph, 'MATCH (guest:User {id: $guestId}) DETACH DELETE guest', { guestId: params.guestId })
          .catch(() => {});
      }
    } catch (err) {
      console.error(`[migrateGuestAccess] skipped graph "${graph}":`, (err as Error)?.message ?? err);
    }
  }

  return total;
}
