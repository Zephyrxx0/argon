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

  const res = await client.roQuery<WorkspaceAccessResult>(
    workspaceId,
    cypher,
    { workspaceId, userId }
  );

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

/**
 * Migrates temporary guest ACCESSES edges to permanent authenticated user upon account linking (D-14).
 * Detaches and removes the temporary guest node.
 */
export async function migrateGuestAccess(
  client: ArgonGraphClient,
  params: MigrateGuestAccessParams
): Promise<number> {
  const cypher = `
    MATCH (guest:User {id: $guestId})-[r:ACCESSES]->(w:Workspace)
    MERGE (u:User {id: $authUserId})
    MERGE (u)-[r2:ACCESSES]->(w)
    SET r2.role = r.role
    DETACH DELETE guest
    RETURN count(w) AS migratedCount;
  `;

  const targetWorkspace = params.workspaceId ?? 'ember-adr-showcase';
  const res = await client.query<{ migratedCount: number }>(
    targetWorkspace,
    cypher,
    {
      guestId: params.guestId,
      authUserId: params.authUserId,
    }
  );

  const row = res.data?.[0];
  const count = row ? Number((row as any).migratedCount ?? 0) : 0;

  // Clean up any detached guest node if guest had no ACCESSES edges
  if (count === 0) {
    await client.query(
      targetWorkspace,
      'MATCH (guest:User {id: $guestId}) DETACH DELETE guest',
      { guestId: params.guestId }
    ).catch(() => {});
  }

  return count;
}
