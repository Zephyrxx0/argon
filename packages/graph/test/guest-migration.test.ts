import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ArgonGraphClient } from '../src/client';
import { checkWorkspaceAccess, migrateGuestAccess, setUserWorkspaceAccess } from '../src';

const isFalkorLive = await (async () => {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const ok = await probe.ping();
    await probe.close();
    return ok;
  } catch {
    return false;
  }
})();

describe('migrateGuestAccess visits every workspace graph (offline)', () => {
  const clientWith = (graphs: string[], failing: string[] = []) => {
    const calls: Array<{ graph: string; cypher: string }> = [];
    const client = {
      getRawClient: () => ({ list: async () => graphs }),
      query: vi.fn(async (graph: string, cypher: string) => {
        calls.push({ graph, cypher });
        if (failing.includes(graph)) throw new Error('boom');
        return { data: cypher.includes('migratedCount') ? [{ migratedCount: graph.startsWith('pub-') ? 1 : 0 }] : [] };
      }),
    } as unknown as ArgonGraphClient;
    return { client, calls };
  };

  it('migrates in all graphs, sums the counts, and cleans up guests that had no edge in a graph', async () => {
    const { client, calls } = clientWith(['ember-adr-showcase', 'pub-a-111111', 'pub-b-222222']);
    const n = await migrateGuestAccess(client, { guestId: 'g', authUserId: 'u' });
    expect(n).toBe(2);
    expect([...new Set(calls.map((c) => c.graph))]).toEqual(['ember-adr-showcase', 'pub-a-111111', 'pub-b-222222']);
    // cleanup only where nothing was migrated
    const cleanups = calls.filter((c) => !c.cypher.includes('migratedCount')).map((c) => c.graph);
    expect(cleanups).toEqual(['ember-adr-showcase']);
  });

  it('a graph that fails never blocks the others (or sign-in)', async () => {
    const { client } = clientWith(['pub-bad-000000', 'pub-ok-111111'], ['pub-bad-000000']);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(migrateGuestAccess(client, { guestId: 'g', authUserId: 'u' })).resolves.toBe(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('an explicit workspaceId limits the migration to that graph', async () => {
    const { client, calls } = clientWith(['a', 'b']);
    await migrateGuestAccess(client, { guestId: 'g', authUserId: 'u', workspaceId: 'b' });
    expect(new Set(calls.map((c) => c.graph))).toEqual(new Set(['b']));
  });

  it('falls back to the showcase graph when the client cannot list graphs', async () => {
    const query = vi.fn(async () => ({ data: [{ migratedCount: 0 }] }));
    await migrateGuestAccess({ query } as unknown as ArgonGraphClient, { guestId: 'g', authUserId: 'u' });
    expect(query).toHaveBeenCalledWith('ember-adr-showcase', expect.any(String), expect.any(Object));
  });
});

describe.skipIf(!isFalkorLive)('migrateGuestAccess (live FalkorDB)', () => {
  const stamp = Date.now();
  const wsA = `test_mig_a_${stamp}`;
  const wsB = `test_mig_b_${stamp}`;
  const wsOther = `test_mig_other_${stamp}`;
  const guest = `guest_${stamp}`;
  const user = `user_${stamp}`;
  let client: ArgonGraphClient;

  beforeAll(async () => {
    client = new ArgonGraphClient();
    await client.connect();
    await setUserWorkspaceAccess(client, { workspaceId: wsA, userId: guest, role: 'owner' });
    await setUserWorkspaceAccess(client, { workspaceId: wsB, userId: guest, role: 'member' });
    await setUserWorkspaceAccess(client, { workspaceId: wsOther, userId: `someone_else_${stamp}`, role: 'owner' });
  });

  afterAll(async () => {
    for (const w of [wsA, wsB, wsOther]) {
      try { await client.selectGraph(w).delete(); } catch { /* ignore */ }
    }
    await client.close();
  });

  it('moves the guest\'s workspaces (in their own graphs) to the signed-in user', async () => {
    // before: the user has no access to the guest's workspaces (this was the bug)
    expect(await checkWorkspaceAccess(client, wsA, user)).toEqual({ exists: true, allowed: false });

    const graphsBefore = (await client.getRawClient().list()).length;
    const migrated = await migrateGuestAccess(client, { guestId: guest, authUserId: user });

    expect(migrated).toBe(2);
    expect(await checkWorkspaceAccess(client, wsA, user)).toEqual({ exists: true, allowed: true });
    expect(await checkWorkspaceAccess(client, wsB, user)).toEqual({ exists: true, allowed: true });
    // roles are kept, the temporary guest is gone, nothing else was touched or created
    const roles = async (w: string) =>
      ((await client.roQuery(w, 'MATCH (:User {id: $u})-[r:ACCESSES]->(:Workspace) RETURN r.role AS role', { u: user })).data as any[]).map((r) => r.role);
    expect(await roles(wsA)).toEqual(['owner']);
    expect(await roles(wsB)).toEqual(['member']);
    for (const w of [wsA, wsB]) {
      expect((await client.roQuery(w, 'MATCH (g:User {id: $g}) RETURN count(g) AS n', { g: guest })).data?.[0]).toMatchObject({ n: 0 });
    }
    expect(await checkWorkspaceAccess(client, wsOther, user)).toEqual({ exists: true, allowed: false });
    expect((await client.getRawClient().list()).length).toBe(graphsBefore);
  });

  it('is idempotent: running it again migrates nothing and keeps the access', async () => {
    expect(await migrateGuestAccess(client, { guestId: guest, authUserId: user })).toBe(0);
    expect(await checkWorkspaceAccess(client, wsA, user)).toEqual({ exists: true, allowed: true });
  });
});
