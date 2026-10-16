import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ArgonGraphClient } from '../../src/client';
import { initWorkspaceGraph } from '../../src/schema/init';
import {
  checkWorkspaceAccess,
  setUserWorkspaceAccess,
  migrateGuestAccess,
} from '../../src/queries/auth';

// Probe FalkorDB reachability at suite load time for graceful skips if offline
const isFalkorLive = await (async () => {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const reachable = await probe.ping();
    await probe.close();
    return reachable;
  } catch {
    return false;
  }
})();

describe('FalkorDB Tenant Schema & Authorization Queries', () => {
  describe('Unit / Mock Query Traversal Contracts', () => {
    it('returns { exists: false, allowed: false } when workspace does not exist (empty query result)', async () => {
      const mockClient = {
        roQuery: vi.fn().mockResolvedValue({ data: [] }),
      } as unknown as ArgonGraphClient;

      const result = await checkWorkspaceAccess(mockClient, 'non-existent-repo', 'user_123');
      expect(result).toEqual({ exists: false, allowed: false });
      expect(mockClient.roQuery).toHaveBeenCalledWith(
        'non-existent-repo',
        expect.stringContaining('OPTIONAL MATCH (u:User {id: $userId})-[r:ACCESSES]->(w)'),
        { workspaceId: 'non-existent-repo', userId: 'user_123' }
      );
      // Strict constraint: Must not use unsupported nested EXISTS { MATCH ... } syntax
      expect((mockClient.roQuery as any).mock.calls[0][1]).not.toContain('EXISTS {');
    });

    it('returns { exists: true, allowed: true } for public workspace regardless of user', async () => {
      const mockClient = {
        roQuery: vi.fn().mockResolvedValue({
          data: [{ exists: true, allowed: true }],
        }),
      } as unknown as ArgonGraphClient;

      const result = await checkWorkspaceAccess(mockClient, 'ember-adr-showcase', 'anonymous_guest');
      expect(result).toEqual({ exists: true, allowed: true });
    });

    it('returns { exists: true, allowed: false } for private workspace without [:ACCESSES] edge', async () => {
      const mockClient = {
        roQuery: vi.fn().mockResolvedValue({
          data: [{ exists: true, allowed: false }],
        }),
      } as unknown as ArgonGraphClient;

      const result = await checkWorkspaceAccess(mockClient, 'private-fintech-repo', 'guest_stranger');
      expect(result).toEqual({ exists: true, allowed: false });
    });

    it('returns { exists: true, allowed: true } for private workspace with valid [:ACCESSES] edge', async () => {
      const mockClient = {
        roQuery: vi.fn().mockResolvedValue({
          data: [{ exists: true, allowed: true }],
        }),
      } as unknown as ArgonGraphClient;

      const result = await checkWorkspaceAccess(mockClient, 'private-fintech-repo', 'member_alice');
      expect(result).toEqual({ exists: true, allowed: true });
    });

    it('ensures setUserWorkspaceAccess enforces privacy: never includes email property (D-10)', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ data: [] }),
      } as unknown as ArgonGraphClient;

      await setUserWorkspaceAccess(mockClient, {
        workspaceId: 'my-project',
        userId: 'usr_789',
        role: 'owner',
        isPublic: false,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        'my-project',
        expect.stringContaining('MERGE (u:User {id: $userId})'),
        {
          workspaceId: 'my-project',
          userId: 'usr_789',
          role: 'owner',
          isPublic: false,
        }
      );

      const cypherText = (mockClient.query as any).mock.calls[0][1];
      expect(cypherText).not.toContain('email');
    });

    it('executes migrateGuestAccess reassigning guest accesses to permanent user (D-14)', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          data: [{ migratedCount: 2 }],
        }),
      } as unknown as ArgonGraphClient;

      const count = await migrateGuestAccess(mockClient, {
        guestId: 'guest_456',
        authUserId: 'usr_123',
      });

      expect(count).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith(
        'ember-adr-showcase',
        expect.stringContaining('DETACH DELETE guest'),
        {
          guestId: 'guest_456',
          authUserId: 'usr_123',
        }
      );
    });
  });

  describe.skipIf(!isFalkorLive)('Live FalkorDB Tenant Graph Operations', () => {
    const testWorkspace = `test_tenant_${Date.now()}`;
    let liveClient: ArgonGraphClient;

    beforeAll(async () => {
      liveClient = new ArgonGraphClient();
      await liveClient.connect();
      await initWorkspaceGraph(liveClient, testWorkspace);
    });

    afterAll(async () => {
      if (liveClient) {
        try {
          const graph = liveClient.selectGraph(testWorkspace);
          await graph.delete();
        } catch {
          // ignore cleanup errors
        }
        await liveClient.close();
      }
    });

    it('returns { exists: false, allowed: false } when querying a non-existent workspace', async () => {
      const res = await checkWorkspaceAccess(liveClient, 'completely-unknown-workspace-xyz', 'usr_any');
      expect(res.exists).toBe(false);
      expect(res.allowed).toBe(false);
    });

    it('grants access on public workspace and denies access on private workspace without edge', async () => {
      // 1. Create a public workspace
      const pubWorkspace = `pub_ws_${Date.now()}`;
      await initWorkspaceGraph(liveClient, pubWorkspace);
      await liveClient.query(
        pubWorkspace,
        `MERGE (w:Workspace {id: $ws}) SET w.is_public = true`,
        { ws: pubWorkspace }
      );

      const pubRes = await checkWorkspaceAccess(liveClient, pubWorkspace, 'stranger_user');
      expect(pubRes.exists).toBe(true);
      expect(pubRes.allowed).toBe(true);

      // 2. Create a private workspace
      const privWorkspace = `priv_ws_${Date.now()}`;
      await initWorkspaceGraph(liveClient, privWorkspace);
      await liveClient.query(
        privWorkspace,
        `MERGE (w:Workspace {id: $ws}) SET w.is_public = false`,
        { ws: privWorkspace }
      );

      const privDenied = await checkWorkspaceAccess(liveClient, privWorkspace, 'unauthorized_guest');
      expect(privDenied.exists).toBe(true);
      expect(privDenied.allowed).toBe(false);

      // 3. Grant access via [:ACCESSES] edge
      await setUserWorkspaceAccess(liveClient, {
        workspaceId: privWorkspace,
        userId: 'authorized_user',
        role: 'member',
        isPublic: false,
      });

      const privAllowed = await checkWorkspaceAccess(liveClient, privWorkspace, 'authorized_user');
      expect(privAllowed.exists).toBe(true);
      expect(privAllowed.allowed).toBe(true);

      // Cleanup
      try {
        await liveClient.selectGraph(pubWorkspace).delete();
        await liveClient.selectGraph(privWorkspace).delete();
      } catch {
        // ignore
      }
    });

    it('verifies (:User) node stores id and metadata but never stores email', async () => {
      await liveClient.query(
        testWorkspace,
        `CREATE (u:User {
          id: 'user_privacy_test',
          login: 'testuser',
          github_id: '12345',
          avatar_url: 'https://github.com/testuser.png',
          created_at: 1700000000000
        })`
      );

      const res = await liveClient.roQuery(
        testWorkspace,
        `MATCH (u:User {id: 'user_privacy_test'}) RETURN u.id AS id, u.login AS login, u.email AS email`
      );

      const userRow = res.data?.[0] as any;
      expect(userRow).toBeDefined();
      expect(userRow.id).toBe('user_privacy_test');
      expect(userRow.login).toBe('testuser');
      expect(userRow.email).toBeNull();
    });
  });
});
