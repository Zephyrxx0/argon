import type { ArgonGraphClient, ArgonEmbedder } from '@argon/graph';

export interface PaletteSearchHit {
  type: 'decision' | 'file' | 'component';
  /** Graph id / path / name. */
  id: string;
  label: string;
  /** Short context line (component, status, PR count...). */
  desc: string;
  /** The string to feed the briefing when this hit is selected. */
  query: string;
  /** Higher is better. Decisions carry cosine similarity; name/path matches a synthetic score. */
  score: number;
}

export interface PaletteSearchResult {
  query: string;
  hits: PaletteSearchHit[];
}

export const PALETTE_LIMITS = {
  decisions: 5,
  files: 4,
  components: 3,
  total: 8,
} as const;

/** A shared embedder: loading the local 512-d model is heavy, so never per-request. */
let sharedEmbedder: ArgonEmbedder | null = null;
async function getEmbedder(): Promise<ArgonEmbedder> {
  if (!sharedEmbedder) {
    const { ArgonEmbedder } = await import('@argon/graph');
    sharedEmbedder = new ArgonEmbedder();
  }
  return sharedEmbedder;
}

/** Test seam: inject a deterministic embedder (and reset between tests). */
export function __setPaletteEmbedder(embedder: ArgonEmbedder | null): void {
  sharedEmbedder = embedder;
}

const asRows = (res: { data?: unknown } | null | undefined): Record<string, unknown>[] =>
  Array.isArray(res?.data) ? (res!.data as Record<string, unknown>[]) : [];
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/**
 * Semantic + literal search over one workspace graph, for the command palette.
 *
 * - Decisions: FalkorDB 512-d vector index (the query text is embedded here), so a question
 *   like "retry storms" finds the retry-backoff decision even without a keyword overlap.
 * - Files and components: parameterized CONTAINS match (there is no file/component embedding),
 *   so these stay literal; a decision match is always ranked above them.
 *
 * Read-only. Never throws for empty results; the caller (route) maps FalkorDB-down to 503.
 */
export async function paletteSearch(
  client: ArgonGraphClient,
  workspaceId: string,
  rawQuery: string
): Promise<PaletteSearchResult> {
  const query = rawQuery.trim();
  if (!query) return { query: '', hits: [] };

  const embedder = await getEmbedder();
  const { vector } = await embedder.embed(query, true);

  const [decisionsRes, filesRes, componentsRes] = await Promise.all([
    vector.length === 512
      ? client
          .roQuery(
            workspaceId,
            `CALL db.idx.vector.queryNodes('Decision', 'embedding', $limit, vecf32($vec))
             YIELD node, score
             OPTIONAL MATCH (node)-[:GOVERNS]->(c:Component)
             RETURN node.id AS id, node.title AS title, node.status AS status,
                    (1.0 - score) AS similarity, c.name AS component`,
            { vec: vector, limit: PALETTE_LIMITS.decisions }
          )
          .catch(() => null)
      : null,
    client
      .roQuery(
        workspaceId,
        `MATCH (f:File) WHERE toLower(f.path) CONTAINS toLower($q)
         OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
         OPTIONAL MATCH (pr:PullRequest)-[:TOUCHES]->(f)
         RETURN f.path AS path, c.name AS component, count(DISTINCT pr) AS touches
         ORDER BY touches DESC, path ASC LIMIT $limit`,
        { q: query, limit: PALETTE_LIMITS.files }
      )
      .catch(() => null),
    client
      .roQuery(
        workspaceId,
        `MATCH (c:Component) WHERE toLower(c.name) CONTAINS toLower($q)
         OPTIONAL MATCH (f:File)-[:IN_COMPONENT]->(c)
         RETURN c.name AS name, count(DISTINCT f) AS files
         ORDER BY files DESC, name ASC LIMIT $limit`,
        { q: query, limit: PALETTE_LIMITS.components }
      )
      .catch(() => null),
  ]);

  const hits: PaletteSearchHit[] = [];

  for (const row of asRows(decisionsRes)) {
    const id = str(row.id);
    if (!id) continue;
    const title = str(row.title, id);
    const component = str(row.component);
    hits.push({
      type: 'decision',
      id,
      label: title,
      desc: [component && `governs ${component}`, str(row.status)].filter(Boolean).join(' · ') || 'decision',
      // ask the briefing about this decision (grounded by its component when known)
      query: component ? `What does ${title} constrain in ${component}?` : `What does ${title} constrain?`,
      score: num(row.similarity),
    });
  }

  for (const row of asRows(filesRes)) {
    const path = str(row.path);
    if (!path) continue;
    const component = str(row.component);
    const touches = num(row.touches);
    hits.push({
      type: 'file',
      id: path,
      label: path,
      desc: component ? `in ${component} · ${touches} PR${touches === 1 ? '' : 's'}` : `${touches} PRs`,
      query: path,
      score: 0,
    });
  }

  for (const row of asRows(componentsRes)) {
    const name = str(row.name);
    if (!name) continue;
    const files = num(row.files);
    hits.push({
      type: 'component',
      id: name,
      label: name,
      desc: `${files} file${files === 1 ? '' : 's'}`,
      query: name,
      score: 0,
    });
  }

  return { query, hits: hits.slice(0, PALETTE_LIMITS.total) };
}
