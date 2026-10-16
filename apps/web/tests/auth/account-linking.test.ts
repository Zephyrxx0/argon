// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { migrateGuestAccess, type ArgonGraphClient } from '@argon/graph';
import { auth } from '@/lib/auth';

describe('Guest Account Linking & Graph Migration', () => {
  it('transfers temporary [:ACCESSES] relationships from guest to authenticated user and detaches guest node (D-14)', async () => {
    const executedQueries: Array<{ cypher: string; params: any }> = [];

    const mockClient = {
      query: vi.fn().mockImplementation(async (_workspace: string, cypher: string, params: any) => {
        executedQueries.push({ cypher, params });
        return { data: [{ migratedCount: 3 }] };
      }),
    } as unknown as ArgonGraphClient;

    const count = await migrateGuestAccess(mockClient, {
      guestId: 'guest_123',
      authUserId: 'user_456',
    });

    expect(count).toBe(3);
    expect(mockClient.query).toHaveBeenCalledWith(
      'ember-adr-showcase',
      expect.stringContaining('MATCH (guest:User {id: $guestId})-[r:ACCESSES]->(w:Workspace)'),
      {
        guestId: 'guest_123',
        authUserId: 'user_456',
      }
    );

    const firstQuery = executedQueries[0].cypher;
    expect(firstQuery).toContain('MERGE (u:User {id: $authUserId})');
    expect(firstQuery).toContain('MERGE (u)-[r2:ACCESSES]->(w)');
    expect(firstQuery).toContain('SET r2.role = r.role');
    expect(firstQuery).toContain('DETACH DELETE guest');
    expect(firstQuery).toContain('RETURN count(w) AS migratedCount');
  });

  it('deletes ephemeral guest node even when guest has zero existing accesses', async () => {
    const executedQueries: Array<{ cypher: string; params: any }> = [];

    const mockClient = {
      query: vi.fn().mockImplementation(async (_workspace: string, cypher: string, params: any) => {
        executedQueries.push({ cypher, params });
        if (cypher.includes('count(w) AS migratedCount')) {
          return { data: [{ migratedCount: 0 }] };
        }
        return { data: [] };
      }),
    } as unknown as ArgonGraphClient;

    const count = await migrateGuestAccess(mockClient, {
      guestId: 'guest_zero',
      authUserId: 'user_new',
      workspaceId: 'ember-adr-showcase',
    });

    expect(count).toBe(0);
    expect(executedQueries.length).toBe(2);
    expect(executedQueries[1].cypher).toContain('MATCH (guest:User {id: $guestId}) DETACH DELETE guest');
    expect(executedQueries[1].params).toEqual({ guestId: 'guest_zero' });
  });

  it('configures onLinkAccount callback in Better Auth anonymous plugin', async () => {
    const anonymousPlugin = auth.options.plugins?.find((p: any) => p.id === 'anonymous') as any;
    expect(anonymousPlugin).toBeDefined();

    // Verify onLinkAccount hook exists in plugin configuration or options
    const onLinkAccount = anonymousPlugin.options?.onLinkAccount || anonymousPlugin.onLinkAccount;
    expect(typeof onLinkAccount).toBe('function');

    // Test invoking onLinkAccount handles errors gracefully without throwing unhandled exceptions
    await expect(
      onLinkAccount({
        anonymousUser: { id: 'guest_test_id' },
        newUser: { id: 'auth_test_id' },
      })
    ).resolves.not.toThrow();
  });
});
