import { describe, it, expect, vi } from 'vitest';
import { loadContributors, loadOverview, roleFor, OVERVIEW_LIMITS } from '@/lib/workspace-data';
import { formatLastActive, toContributor } from '@/components/contributor/contributor-picker';
import type { ArgonGraphClient } from '@argon/graph';

/** Fake client: answers each query by a distinctive fragment of its Cypher. */
function fakeClient(answers: Array<[string, unknown[]]>) {
  const roQuery = vi.fn().mockImplementation((_ws: string, cypher: string) => {
    const hit = answers.find(([needle]) => cypher.includes(needle));
    return Promise.resolve({ data: hit ? hit[1] : [] });
  });
  return { client: { roQuery } as unknown as ArgonGraphClient, roQuery };
}

describe('loadContributors', () => {
  it('merges authored + reviewed counts, ranks people, and links authenticated users', async () => {
    const { client, roQuery } = fakeClient([
      ['p.display_name', [
        { id: 'p1', name: 'Alice', authored: 40, lastActive: 1700000000 },
        { id: 'p2', name: 'Bob', authored: 5, lastActive: 1690000000 },
        { id: 'p3', name: 'Cara', authored: 0, lastActive: null },
      ]],
      ['REVIEWED', [{ id: 'p2', reviewed: 30 }, { id: 'p3', reviewed: 2 }]],
      ['IDENTIFIES', [{ id: 'p1', userId: 'user-9' }]],
    ]);

    const people = await loadContributors(client, 'ws-a');

    expect(people.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(people[0]).toMatchObject({ name: 'Alice', commits: 40, role: 'Top Contributor', userId: 'user-9' });
    expect(people[1]).toMatchObject({ commits: 5, reviews: 30, role: 'Reviewer' });
    expect(people[2]).toMatchObject({ role: 'Reviewer', lastActiveAt: null });
    // every query is run against the requested workspace only
    expect(roQuery.mock.calls.every(([ws]) => ws === 'ws-a')).toBe(true);
  });

  it('returns an empty list for a workspace without people', async () => {
    const { client } = fakeClient([]);
    expect(await loadContributors(client, 'ws-empty')).toEqual([]);
  });

  it('derives roles', () => {
    expect(roleFor(0, 10, 0)).toBe('Top Contributor');
    expect(roleFor(3, 10, 2)).toBe('Author');
    expect(roleFor(3, 1, 9)).toBe('Reviewer');
    expect(roleFor(1, 0, 0)).toBe('Contributor');
  });
});

describe('contributor picker helpers', () => {
  it('formats relative activity', () => {
    const now = 1_700_000_000_000;
    expect(formatLastActive(null, now)).toBe('unknown');
    expect(formatLastActive(now / 1000 - 30, now)).toBe('just now');
    expect(formatLastActive(now / 1000 - 3 * 3600, now)).toBe('3h ago');
    expect(formatLastActive(now / 1000 - 2 * 86400, now)).toBe('2d ago');
    expect(formatLastActive(now / 1000 - 70 * 86400, now)).toBe('2mo ago');
  });

  it('maps API contributors to picker rows', () => {
    expect(
      toContributor({ id: 'p', name: 'N', commits: 3, reviews: 0, role: 'Author', lastActiveAt: null, userId: 'u' })
    ).toMatchObject({ id: 'p', name: 'N', commits: 3, role: 'Author', lastActive: 'unknown', userId: 'u' });
  });
});

describe('loadOverview', () => {
  const comps = [
    { name: 'lib', files: 16 },
    { name: 'app', files: 23 },
    { name: 'scripts', files: 18 },
  ];

  it('builds components, strongest couplings, top owners and connected decisions', async () => {
    const { client } = fakeClient([
      ['count(DISTINCT f) AS files', comps],
      ['DEPENDS_ON', [
        { source: 'app', target: 'scripts', weight: 0.9 },
        { source: 'app', target: 'lib', weight: 0.8 },
        { source: 'app', target: 'ghost', weight: 0.7 }, // unknown component: dropped
        { source: 'lib', target: 'scripts', weight: 0.5 },
      ]],
      ['AUTHORED]->(pr:PullRequest)-[:TOUCHES]', [
        // the query is ORDER BY prs DESC, so the first row per component is its top author
        { id: 'p1', name: 'Alice', component: 'app', prs: 30 },
        { id: 'p2', name: 'Bob', component: 'lib', prs: 20 },
        { id: 'p1', name: 'Alice', component: 'lib', prs: 12 },
      ]],
      ['count(DISTINCT d) AS decisions', [{ component: 'lib', decisions: 2 }]],
      ['d.summary AS summary', [
        { id: 'DEC-2', title: 'New', status: 'active', summary: 'x', validFrom: 2, components: ['lib'] },
        { id: 'DEC-1', title: 'Old', status: 'superseded', summary: 'y', validFrom: 1, components: [] },
        { id: 'DEC-X', title: 'Orphan', status: 'accepted', summary: 'z', validFrom: 0, components: [] },
      ]],
      ['SUPERSEDES', [{ newer: 'DEC-2', older: 'DEC-1' }]],
    ]);

    const { elements, stats } = await loadOverview(client, 'ws-a');
    const byId = Object.fromEntries(elements.nodes.map((n) => [n.data.id, n.data]));

    expect(['lib', 'app', 'scripts'].every((id) => byId[id]?.type === 'Component')).toBe(true);
    expect(byId.lib!.properties.reason).toBe('16 files · 2 decisions');
    // people: only each component's top author; Alice owns app, Bob owns lib
    expect(byId.p1!.type).toBe('Person');
    expect(elements.edges.filter((e) => e.data.label === 'OWNS').map((e) => `${e.data.source}->${e.data.target}`).sort())
      .toEqual(['p1->app', 'p2->lib']);
    // decisions: connected ones only (orphan is hidden), with supersession edge and GOVERNS
    expect(byId['DEC-X']).toBeUndefined();
    expect(byId['DEC-1']!.properties.status).toBe('superseded');
    expect(elements.edges.find((e) => e.data.label === 'SUPERSEDED_BY')).toMatchObject({
      data: { source: 'DEC-1', target: 'DEC-2' },
    });
    expect(elements.edges.some((e) => e.data.label === 'GOVERNS' && e.data.target === 'lib')).toBe(true);
    // couplings between unknown components are dropped; all edges reference existing nodes
    const ids = new Set(elements.nodes.map((n) => n.data.id));
    expect(elements.edges.every((e) => ids.has(e.data.source) && ids.has(e.data.target))).toBe(true);
    expect(stats).toMatchObject({ components: 3, files: 57, decisions: 2, people: 2 });
  });

  it('caps dependency fan-out per component and reports truncation', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `c${i}`, files: 1 }));
    const deps = many.slice(1).map((c, i) => ({ source: 'c0', target: c.name, weight: 1 - i * 0.1 }));
    const { client } = fakeClient([['count(DISTINCT f) AS files', many], ['DEPENDS_ON', deps]]);
    const { elements, stats } = await loadOverview(client, 'ws-a');
    expect(elements.edges.filter((e) => e.data.source === 'c0')).toHaveLength(OVERVIEW_LIMITS.dependenciesPerComponent);
    expect(stats.truncated).toBe(true);
  });

  it('gives an empty (not a fake) graph for an empty workspace', async () => {
    const { client } = fakeClient([]);
    const { elements, stats } = await loadOverview(client, 'ws-empty');
    expect(elements).toEqual({ nodes: [], edges: [] });
    expect(stats.components).toBe(0);
  });
});

describe('githubAvatarUrl', () => {
  it('builds an avatar URL for plausible GitHub logins only', async () => {
    const { githubAvatarUrl } = await import('@/lib/workspace-data');
    expect(githubAvatarUrl('Zephyrxx0')).toBe('https://avatars.githubusercontent.com/Zephyrxx0?size=80');
    expect(githubAvatarUrl('octo-cat', 36)).toBe('https://avatars.githubusercontent.com/octo-cat?size=36');
    // not GitHub-login-shaped: no URL (so <img> never points at junk)
    expect(githubAvatarUrl('Jane Doe')).toBeNull();
    expect(githubAvatarUrl('a@b.com')).toBeNull();
    expect(githubAvatarUrl('-leading')).toBeNull();
    expect(githubAvatarUrl('')).toBeNull();
    expect(githubAvatarUrl(undefined)).toBeNull();
  });

  it('attaches an avatar to owner nodes and contributors whose name is a GitHub login', async () => {
    const { loadOverview, loadContributors } = await import('@/lib/workspace-data');
    const { vi } = await import('vitest');
    const roQuery = vi.fn().mockImplementation((_ws: string, cypher: string) => {
      if (cypher.includes('count(DISTINCT f) AS files')) return Promise.resolve({ data: [{ name: 'lib', files: 3 }] });
      if (cypher.includes('AUTHORED]->(pr:PullRequest)-[:TOUCHES]'))
        return Promise.resolve({ data: [{ id: 'p1', name: 'Zephyrxx0', component: 'lib', prs: 9 }] });
      if (cypher.includes('p.display_name'))
        return Promise.resolve({ data: [{ id: 'p1', name: 'Zephyrxx0', authored: 9, lastActive: null }] });
      return Promise.resolve({ data: [] });
    });
    const client = { roQuery } as any;

    const { elements } = await loadOverview(client, 'ws');
    const person = elements.nodes.find((n) => n.data.type === 'Person')!;
    expect(person.data.properties.avatarUrl).toBe('https://avatars.githubusercontent.com/Zephyrxx0?size=80');

    const people = await loadContributors(client, 'ws');
    expect(people[0]!.avatarUrl).toBe('https://avatars.githubusercontent.com/Zephyrxx0?size=80');
  });
});
