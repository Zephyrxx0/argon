import type { ArgonGraphClient } from '@argon/graph';
import type { GraphElements } from '@/lib/graph/model';

/**
 * Read models for one workspace's graph. Everything here is derived from FalkorDB for the
 * requested workspace only (each workspace is its own graph), so nothing can leak between
 * workspaces. Queries are constant strings: no user input is ever interpolated.
 */

type Row = Record<string, unknown>;
const rows = (res: { data?: unknown }): Row[] => (Array.isArray(res.data) ? (res.data as Row[]) : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));

// A GitHub username (used to guess an avatar URL). Deliberately strict so we never point an
// <img> at a bad URL for names that are clearly not GitHub handles ("Jane Doe", emails...).
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
export function githubAvatarUrl(name: string | undefined, size = 80): string | null {
  if (!name || !GITHUB_LOGIN.test(name)) return null;
  return `https://avatars.githubusercontent.com/${name}?size=${size}`;
}
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ───────────────────────── Contributors ─────────────────────────

export interface WorkspaceContributor {
  id: string;
  name: string;
  /** merged PRs authored */
  commits: number;
  reviews: number;
  role: string;
  /** epoch seconds of the most recent authored PR, or null */
  lastActiveAt: number | null;
  /** set when an authenticated Argon user has been linked to this person */
  userId?: string;
  /** best-effort GitHub avatar, when the name is a plausible GitHub login */
  avatarUrl?: string;
}

export interface ContributorsResponse {
  workspaceId: string;
  contributors: WorkspaceContributor[];
}

const MAX_CONTRIBUTORS = 100;

export function roleFor(rank: number, authored: number, reviewed: number): string {
  if (authored === 0 && reviewed === 0) return 'Contributor';
  if (rank === 0 && authored > 0) return 'Top Contributor';
  return reviewed > authored ? 'Reviewer' : 'Author';
}

export async function loadContributors(
  client: ArgonGraphClient,
  workspaceId: string
): Promise<WorkspaceContributor[]> {
  const [authored, reviewed, linked] = await Promise.all([
    client.roQuery(
      workspaceId,
      `MATCH (p:Person)
       OPTIONAL MATCH (p)-[:AUTHORED]->(a:PullRequest)
       RETURN p.id AS id, coalesce(p.display_name, p.name, p.id) AS name,
              count(a) AS authored, max(a.merged_at) AS lastActive
       ORDER BY authored DESC LIMIT 500`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (p:Person)-[:REVIEWED]->(r:PullRequest)
       RETURN p.id AS id, count(r) AS reviewed LIMIT 500`
    ),
    client
      .roQuery(workspaceId, `MATCH (u:User)-[:IDENTIFIES]->(p:Person) RETURN p.id AS id, u.id AS userId LIMIT 500`)
      .catch(() => ({ data: [] })),
  ]);

  const reviewedBy = new Map(rows(reviewed).map((r) => [str(r.id), num(r.reviewed)]));
  const userBy = new Map(rows(linked).map((r) => [str(r.id), str(r.userId)]));

  const merged = rows(authored)
    .filter((r) => str(r.id))
    .map((r) => ({
      id: str(r.id),
      name: str(r.name, str(r.id)),
      authored: num(r.authored),
      reviews: reviewedBy.get(str(r.id)) ?? 0,
      lastActive: r.lastActive == null ? null : num(r.lastActive) || null,
    }))
    .sort((a, b) => b.authored + b.reviews - (a.authored + a.reviews) || a.name.localeCompare(b.name))
    .slice(0, MAX_CONTRIBUTORS);

  return merged.map((p, rank) => {
    const avatarUrl = githubAvatarUrl(p.name);
    return {
      id: p.id,
      name: p.name,
      commits: p.authored,
      reviews: p.reviews,
      role: roleFor(rank, p.authored, p.reviews),
      lastActiveAt: p.lastActive,
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(userBy.get(p.id) ? { userId: userBy.get(p.id) } : {}),
    };
  });
}

// ───────────────────────── Overview graph ─────────────────────────

export interface OverviewStats {
  components: number;
  files: number;
  decisions: number;
  people: number;
  /** true when caps hid part of the graph */
  truncated: boolean;
}

export interface OverviewFile {
  path: string;
  component: string | null;
  /** merged PRs that touched the file */
  touches: number;
}

export interface OverviewResponse {
  workspaceId: string;
  elements: GraphElements;
  stats: OverviewStats;
  /** Most-changed files: material for suggestions / the command palette */
  topFiles: OverviewFile[];
}

export const OVERVIEW_LIMITS = {
  components: 24,
  dependenciesPerComponent: 2,
  people: 8,
  decisions: 10,
  topFiles: 60,
} as const;

export async function loadOverview(client: ArgonGraphClient, workspaceId: string): Promise<OverviewResponse> {
  const [comps, deps, owners, decisionCounts, decisions, supersedes, files] = await Promise.all([
    client.roQuery(
      workspaceId,
      `MATCH (c:Component)
       OPTIONAL MATCH (f:File)-[:IN_COMPONENT]->(c)
       RETURN c.name AS name, count(DISTINCT f) AS files
       ORDER BY files DESC LIMIT 200`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (a:Component)-[r:DEPENDS_ON]->(b:Component)
       RETURN a.name AS source, b.name AS target, coalesce(r.weight, 0) AS weight
       ORDER BY weight DESC LIMIT 1000`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (p:Person)-[:AUTHORED]->(pr:PullRequest)-[:TOUCHES]->(:File)-[:IN_COMPONENT]->(c:Component)
       RETURN p.id AS id, coalesce(p.display_name, p.name, p.id) AS name, c.name AS component,
              count(DISTINCT pr) AS prs
       ORDER BY prs DESC LIMIT 500`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (d:Decision)-[:GOVERNS]->(c:Component)
       RETURN c.name AS component, count(DISTINCT d) AS decisions LIMIT 500`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (d:Decision)
       OPTIONAL MATCH (d)-[:GOVERNS]->(c:Component)
       RETURN d.id AS id, d.title AS title, d.status AS status, d.summary AS summary,
              d.valid_from AS validFrom, collect(DISTINCT c.name) AS components
       ORDER BY validFrom DESC LIMIT 200`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (n:Decision)-[:SUPERSEDES]->(o:Decision) RETURN n.id AS newer, o.id AS older LIMIT 200`
    ),
    client.roQuery(
      workspaceId,
      `MATCH (f:File)
       OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
       OPTIONAL MATCH (pr:PullRequest)-[:TOUCHES]->(f)
       RETURN f.path AS path, c.name AS component, count(DISTINCT pr) AS touches
       ORDER BY touches DESC, path ASC LIMIT ${OVERVIEW_LIMITS.topFiles}`
    ),
  ]);

  let truncated = false;
  const nodes: GraphElements['nodes'] = [];
  const edges: GraphElements['edges'] = [];

  // Components (largest first)
  const allComps = rows(comps).filter((r) => str(r.name));
  const shownComps = allComps.slice(0, OVERVIEW_LIMITS.components);
  if (allComps.length > shownComps.length) truncated = true;
  const compNames = new Set(shownComps.map((c) => str(c.name)));
  const decisionsBy = new Map(rows(decisionCounts).map((r) => [str(r.component), num(r.decisions)]));
  let totalFiles = 0;

  for (const c of shownComps) {
    const name = str(c.name);
    const files = num(c.files);
    totalFiles += files;
    const nDec = decisionsBy.get(name) ?? 0;
    nodes.push({
      data: {
        id: name,
        label: name,
        type: 'Component',
        properties: {
          reason: `${files} file${files === 1 ? '' : 's'}${nDec ? ` · ${nDec} decision${nDec === 1 ? '' : 's'}` : ''}`,
          files,
          decisions: nDec,
        },
      },
    });
  }
  for (const c of allComps.slice(OVERVIEW_LIMITS.components)) totalFiles += num(c.files);

  // Strongest couplings: top N outgoing per component keeps the graph readable
  const perSource = new Map<string, number>();
  const seenDeps = new Set<string>();
  for (const d of rows(deps)) {
    const source = str(d.source);
    const target = str(d.target);
    if (!compNames.has(source) || !compNames.has(target) || source === target) continue;
    const used = perSource.get(source) ?? 0;
    if (used >= OVERVIEW_LIMITS.dependenciesPerComponent) {
      truncated = true;
      continue;
    }
    const id = `dep:${source}->${target}`;
    if (seenDeps.has(id)) continue;
    seenDeps.add(id);
    perSource.set(source, used + 1);
    edges.push({ data: { id, source, target, label: 'DEPENDS_ON', properties: { weight: num(d.weight) } } });
  }

  // People: the top author of each component, capped
  const topOwnerByComp = new Map<string, { id: string; name: string; prs: number }>();
  for (const o of rows(owners)) {
    const comp = str(o.component);
    if (!compNames.has(comp) || topOwnerByComp.has(comp)) continue; // rows are sorted by prs desc
    topOwnerByComp.set(comp, { id: str(o.id), name: str(o.name, str(o.id)), prs: num(o.prs) });
  }
  const totalByPerson = new Map<string, number>();
  for (const o of rows(owners)) totalByPerson.set(str(o.id), (totalByPerson.get(str(o.id)) ?? 0) + num(o.prs));
  const ownerIds = [...new Set([...topOwnerByComp.values()].map((o) => o.id))]
    .sort((a, b) => (totalByPerson.get(b) ?? 0) - (totalByPerson.get(a) ?? 0))
    .slice(0, OVERVIEW_LIMITS.people);
  if (new Set([...topOwnerByComp.values()].map((o) => o.id)).size > ownerIds.length) truncated = true;
  const shownPeople = new Set(ownerIds);
  const nameById = new Map([...topOwnerByComp.values()].map((o) => [o.id, o.name]));
  for (const id of ownerIds) {
    const name = nameById.get(id) ?? id;
    const avatarUrl = githubAvatarUrl(name);
    nodes.push({
      data: {
        id,
        label: name,
        type: 'Person',
        properties: {
          role: 'Top contributor',
          commits: totalByPerson.get(id) ?? 0,
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      },
    });
  }
  for (const [comp, o] of topOwnerByComp) {
    if (!shownPeople.has(o.id)) continue;
    edges.push({ data: { id: `own:${o.id}->${comp}`, source: o.id, target: comp, label: 'OWNS', properties: { prs: o.prs } } });
  }

  // Decisions that are actually connected to something (a component or a supersession)
  const linkedBySupersession = new Set<string>();
  for (const s of rows(supersedes)) {
    linkedBySupersession.add(str(s.newer));
    linkedBySupersession.add(str(s.older));
  }
  const connected = rows(decisions).filter((d) => {
    const comps = Array.isArray(d.components) ? (d.components as unknown[]).map(String) : [];
    return str(d.id) && (comps.some((c) => compNames.has(c)) || linkedBySupersession.has(str(d.id)));
  });
  const shownDecisions = connected.slice(0, OVERVIEW_LIMITS.decisions);
  if (connected.length > shownDecisions.length) truncated = true;
  const decisionIds = new Set(shownDecisions.map((d) => str(d.id)));

  for (const d of shownDecisions) {
    const id = str(d.id);
    nodes.push({
      data: {
        id,
        label: id,
        type: 'Decision',
        properties: {
          title: str(d.title, id),
          status: str(d.status, 'active'),
          ...(str(d.summary) ? { constraint: str(d.summary) } : {}),
        },
      },
    });
    const comps = Array.isArray(d.components) ? (d.components as unknown[]).map(String) : [];
    for (const comp of comps) {
      if (compNames.has(comp)) {
        edges.push({ data: { id: `gov:${id}->${comp}`, source: id, target: comp, label: 'GOVERNS', properties: {} } });
      }
    }
  }
  for (const s of rows(supersedes)) {
    const newer = str(s.newer);
    const older = str(s.older);
    if (decisionIds.has(newer) && decisionIds.has(older)) {
      edges.push({
        data: { id: `sup:${older}->${newer}`, source: older, target: newer, label: 'SUPERSEDED_BY', properties: {} },
      });
    }
  }

  return {
    workspaceId,
    elements: { nodes, edges },
    stats: {
      components: allComps.length,
      files: totalFiles,
      decisions: connected.length,
      people: totalByPerson.size,
      truncated,
    },
    topFiles: rows(files)
      .filter((r) => str(r.path))
      .map((r) => ({
        path: str(r.path),
        component: r.component == null ? null : str(r.component),
        touches: num(r.touches),
      })),
  };
}
