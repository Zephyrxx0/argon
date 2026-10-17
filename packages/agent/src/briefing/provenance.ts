import type {
  CodeOwnerItem,
  EvidenceSource,
  KeyOwnerItem,
} from './types.js';

/** `true` for an absolute http(s) URL (the only kind a browser link can safely point at). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Classifies a stored `source_url` by what it points at on GitHub-style hosts. */
export function sourceKindFromUrl(url: string): EvidenceSource['kind'] {
  if (/\/commit\/[0-9a-f]{7,40}/i.test(url)) return 'commit';
  if (/\/pull\/\d+/.test(url)) return 'pull_request';
  if (/\/issues\/\d+/.test(url)) return 'issue';
  return 'document';
}

/**
 * Display reference for a pull request node: "#12" for a real GitHub PR, otherwise the node id
 * (ingested commits are PullRequest nodes without a number, e.g. "pr_1a2b3c4d5e6f").
 */
export function pullRequestRef(number: unknown, id: string): string {
  const n = Number(number);
  return number != null && Number.isFinite(n) && n > 0 ? `#${n}` : id;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface WhoKnowsAggregate {
  keyOwners: KeyOwnerItem[];
  codeOwners: CodeOwnerItem[];
  /** Every graph node id mentioned by the rows (all citable). */
  nodeIds: string[];
}

/**
 * Folds `04_who_knows` rows into one entry per person.
 *
 * The query returns authored, reviewed and CODEOWNERS facts as separate rows (see the query
 * header), so authored and reviewed counts are simply added per person, and never multiplied.
 * `component` is the scoped component where the person is most active.
 */
export function aggregateWhoKnows(rows: any[]): WhoKnowsAggregate {
  const people = new Map<
    string,
    { item: KeyOwnerItem; byComponent: Map<string, number> }
  >();
  const codeOwners: CodeOwnerItem[] = [];
  const seenOwners = new Set<string>();
  const nodeIds = new Set<string>();

  const touch = (id: string, name: unknown, component: string) => {
    nodeIds.add(id);
    let entry = people.get(id);
    if (!entry) {
      entry = {
        item: {
          personId: id,
          name: typeof name === 'string' && name ? name : id,
          component,
          authoredCount: 0,
          reviewedCount: 0,
        },
        byComponent: new Map(),
      };
      people.set(id, entry);
    }
    return entry;
  };

  for (const row of rows) {
    const component = String(row?.component ?? '');
    if (row?.authorId) {
      const entry = touch(String(row.authorId), row.authorName, component);
      const n = num(row.authoredCount);
      entry.item.authoredCount += n;
      entry.byComponent.set(component, (entry.byComponent.get(component) ?? 0) + n);
    }
    if (row?.reviewerId) {
      const entry = touch(String(row.reviewerId), row.reviewerName, component);
      const n = num(row.reviewedCount);
      entry.item.reviewedCount += n;
      entry.byComponent.set(component, (entry.byComponent.get(component) ?? 0) + n);
    }
    if (row?.ownerId) {
      const ownerId = String(row.ownerId);
      const key = `${ownerId}|${component}`;
      nodeIds.add(ownerId);
      if (!seenOwners.has(key)) {
        seenOwners.add(key);
        codeOwners.push({
          ownerId,
          name: typeof row.ownerName === 'string' && row.ownerName ? row.ownerName : ownerId,
          component,
          pattern: row.ownerPattern ? String(row.ownerPattern) : undefined,
          kind: ownerId.startsWith('@') && ownerId.includes('/') ? 'team' : 'person',
        });
      }
    }
  }

  const ownerIds = new Set(codeOwners.map((o) => o.ownerId));
  const keyOwners: KeyOwnerItem[] = [];
  for (const { item, byComponent } of people.values()) {
    let best = item.component;
    let bestN = -1;
    for (const [component, n] of byComponent) {
      if (n > bestN) {
        best = component;
        bestN = n;
      }
    }
    item.component = best;
    if (ownerIds.has(item.personId)) item.isCodeOwner = true;
    keyOwners.push(item);
  }

  keyOwners.sort(
    (a, b) =>
      b.authoredCount + b.reviewedCount - (a.authoredCount + a.reviewedCount) ||
      a.name.localeCompare(b.name)
  );

  return { keyOwners, codeOwners, nodeIds: [...nodeIds] };
}

/** Accumulates de-duplicated provenance links. */
export class SourceCollector {
  private readonly seen = new Set<string>();
  readonly sources: EvidenceSource[] = [];

  add(source: EvidenceSource): void {
    if (!source.nodeId) return;
    if (source.url !== undefined && !isHttpUrl(source.url)) return;
    const key = `${source.nodeId}|${source.kind}|${source.relatedTo ?? ''}|${source.url ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.sources.push(source);
  }

  /** The decision's own origin (commit/blob URL) when it is a real link. */
  addDecisionOrigin(decisionId: string, title: string, url: unknown): void {
    if (!isHttpUrl(url)) return;
    this.add({ nodeId: decisionId, kind: sourceKindFromUrl(url), label: title, url, relatedTo: decisionId });
  }

  addPullRequest(
    relatedTo: string,
    pr: { id?: unknown; number?: unknown; url?: unknown; title?: unknown }
  ): void {
    const id = pr.id == null ? '' : String(pr.id);
    if (!id || !isHttpUrl(pr.url)) return;
    const ref = pullRequestRef(pr.number, id);
    const title = typeof pr.title === 'string' && pr.title ? ` ${pr.title}` : '';
    this.add({ nodeId: id, kind: 'pull_request', label: `PR ${ref}${title}`.slice(0, 120), url: pr.url, relatedTo });
  }

  addIssue(
    relatedTo: string,
    issue: { id?: unknown; number?: unknown; url?: unknown; title?: unknown; state?: unknown }
  ): void {
    const id = issue.id == null ? '' : String(issue.id);
    if (!id || !isHttpUrl(issue.url)) return;
    const n = Number(issue.number);
    const ref = Number.isFinite(n) && n > 0 ? `#${n}` : id;
    const title = typeof issue.title === 'string' && issue.title ? ` ${issue.title}` : '';
    this.add({
      nodeId: id,
      kind: 'issue',
      label: `Issue ${ref}${title}`.slice(0, 120),
      url: issue.url,
      state: typeof issue.state === 'string' ? issue.state : undefined,
      relatedTo,
    });
  }
}
