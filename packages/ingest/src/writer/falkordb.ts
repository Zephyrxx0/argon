import type { ArgonGraphClient } from '@argon/graph';
import * as queries from './queries.js';
import { redactSecrets } from '../git/redact.js';
import { hashAuthorEmail } from '../git/author.js';

function dropUndefined<T>(item: T): T {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export interface PullRequestMetadata {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  body_excerpt: string;
  merged_at?: number;
  is_revert?: boolean;
}

export class FalkorIngestWriter {
  constructor(
    private readonly client: ArgonGraphClient,
    private readonly workspaceId: string
  ) {}

  /**
   * Updates or creates the operational IngestJob node directly in FalkorDB.
   */
  async updateJobStatus(
    jobId: string,
    repoUrl: string,
    status: string,
    progress: number,
    error: string | null = null
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const sanitizedError = error ? redactSecrets(error) : null;
    await this.client.query(this.workspaceId, queries.UPDATE_JOB_STATUS, {
      jobId,
      repoUrl: redactSecrets(repoUrl),
      status,
      progress,
      error: sanitizedError,
      updatedAt: now,
      startedAt: now,
    });
  }

  /**
   * Heartbeat: bumps `updated_at` of a still-running job so readers can tell a slow job from a
   * dead one. Never resurrects a job that already finished.
   */
  async touchJob(jobId: string): Promise<void> {
    await this.client.query(this.workspaceId, queries.TOUCH_JOB, {
      jobId,
      updatedAt: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Executes a parameterized Cypher write in chunked batches (default 500 items).
   */
  async writeBatch<T>(query: string, items: T[], batchSize = 500): Promise<void> {
    if (items.length === 0) {
      return;
    }

    for (let i = 0; i < items.length; i += batchSize) {
      // The FalkorDB client refuses `undefined` values (e.g. a decision whose embedding could not
      // be computed); drop those keys so they read as null/absent in Cypher.
      const batch = items.slice(i, i + batchSize).map(dropUndefined);
      await this.client.query(this.workspaceId, query, { batch });
    }
  }

  async writePersons(persons: { id: string; name: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_PERSONS, persons);
  }

  async writeFiles(files: string[]): Promise<void> {
    const rows = files.map((path) => ({ path }));
    await this.writeBatch(queries.BATCH_MERGE_FILES, rows);
  }

  async writePullRequests(
    prs: { id: string; title: string; merged_at: number; is_revert: boolean }[]
  ): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_PULL_REQUESTS, prs);
  }

  async writeComponents(components: { name: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_COMPONENTS, components);
  }

  async writeDecisions(
    decisions: {
      id: string;
      title: string;
      status: string;
      valid_from: number;
      valid_to: number | null;
      source_url: string;
      source_kind: string;
      summary: string;
      embedding?: number[];
      /** Chat decisions only: the data is invented, and the channel it came from. */
      synthetic?: boolean;
      source_channel?: string;
    }[]
  ): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_DECISIONS, decisions);
  }

  async writeTouchesEdges(edges: { pr_id: string; file_path: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_TOUCHES, edges);
  }

  async writeAuthoredEdges(edges: { author_id: string; pr_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_AUTHORED, edges);
  }

  async writeInComponentEdges(edges: { file_path: string; component_name: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_IN_COMPONENT, edges);
  }

  async writeDependsOnEdges(
    edges: { source: string; target: string; weight: number; count: number }[]
  ): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_DEPENDS_ON, edges);
  }

  /** (File)-[:CO_CHANGES {weight, count}]->(File): files that repeatedly change in the same commit. */
  async writeCoChangesEdges(
    edges: { source: string; target: string; weight: number; count: number }[]
  ): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_CO_CHANGES, edges);
  }

  async writeRevertsEdges(edges: { revert_id: string; reverted_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_REVERTS, edges);
  }

  async writeSupersedesEdges(edges: { source_id: string; target_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_SUPERSEDES, edges);
  }

  async writeGovernsEdges(edges: { decision_id: string; component_name: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_GOVERNS, edges);
  }

  // ---- Company Brain ----

  async writeExtractedFromEdges(edges: { decision_id: string; pr_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_EXTRACTED_FROM, edges);
  }

  async updatePullRequests(rows: PullRequestMetadata[]): Promise<void> {
    await this.writeBatch(queries.BATCH_UPDATE_PULL_REQUESTS, rows);
  }

  async mergePlaceholderPullRequests(rows: PullRequestMetadata[]): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_PLACEHOLDER_PULL_REQUESTS, rows);
  }

  async retirePlaceholderPullRequests(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.client.query(this.workspaceId, queries.RETIRE_PLACEHOLDER_PULL_REQUESTS, { ids });
  }

  async writeGitHubPersons(persons: { id: string; login: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_GITHUB_PERSONS, persons);
  }

  async setPersonLogins(persons: { id: string; login: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_SET_PERSON_LOGIN, persons);
  }

  async writeReviewedEdges(
    edges: { reviewer_id: string; pr_id: string; state: string; count: number; last_at: number }[]
  ): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_REVIEWED, edges);
  }

  async writeIssues(
    issues: { id: string; number: number; title: string; state: string; url: string; created_at: number }[]
  ): Promise<void> {
    await this.writeBatch(queries.BATCH_MERGE_ISSUES, issues);
  }

  async writeClosesEdges(edges: { pr_id: string; issue_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_CLOSES, edges);
  }

  /** Derives (Issue)-[:AFFECTS]->(Component) for the given issues from the files their PRs touch. */
  async deriveIssueAffects(issueIds: string[]): Promise<void> {
    for (let i = 0; i < issueIds.length; i += 200) {
      await this.client.query(this.workspaceId, queries.BATCH_DERIVE_ISSUE_AFFECTS, {
        ids: issueIds.slice(i, i + 200),
      });
    }
  }

  async replaceComponentOwnership(owners: {
    persons: { owner_id: string; component_name: string; pattern: string; coverage: number }[];
    teams: { id: string; name: string }[];
    teamEdges: { owner_id: string; component_name: string; pattern: string; coverage: number }[];
  }): Promise<void> {
    await this.client.query(this.workspaceId, queries.DELETE_COMPONENT_OWNERSHIP);
    await this.writeBatch(queries.BATCH_MERGE_TEAMS, owners.teams);
    await this.writeBatch(queries.BATCH_EDGES_OWNS_PERSON, owners.persons);
    await this.writeBatch(queries.BATCH_EDGES_OWNS_TEAM, owners.teamEdges);
  }

  async setJobGitHubStatus(jobId: string, status: string, note: string | null): Promise<void> {
    await this.client.query(this.workspaceId, queries.SET_JOB_GITHUB_STATUS, {
      jobId,
      status,
      note: note ? redactSecrets(note).slice(0, 500) : null,
    });
  }

  /** Pull request number -> id of the node that already carries it (numbers are unique). */
  async readPullRequestIdsByNumber(numbers: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    for (let i = 0; i < numbers.length; i += 500) {
      const res = await this.client.roQuery<{ number: unknown; id: unknown }>(
        this.workspaceId,
        queries.READ_PULL_REQUEST_IDS_BY_NUMBER,
        { numbers: numbers.slice(i, i + 500) }
      );
      for (const row of res.data ?? []) out.set(Number(row.number), String(row.id));
    }
    return out;
  }

  /** Which of these ids already exist in the graph (used to report what a re-sync added). */
  async existingIds(kind: 'pull_request' | 'decision' | 'file', keys: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const [query, param, field] =
      kind === 'pull_request'
        ? [queries.READ_EXISTING_PULL_REQUEST_IDS, 'ids', 'id']
        : kind === 'decision'
          ? [queries.READ_EXISTING_DECISIONS, 'ids', 'id']
          : [queries.READ_EXISTING_FILES, 'paths', 'path'];
    for (let i = 0; i < keys.length; i += 500) {
      const res = await this.client.roQuery<Record<string, unknown>>(this.workspaceId, query, {
        [param]: keys.slice(i, i + 500),
      });
      for (const row of res.data ?? []) {
        out.set(String(row[field]), row.status == null ? null : String(row.status));
      }
    }
    return out;
  }

  async linkUserToMinedPersons(
    userId: string,
    userLogin: string,
    userEmails: string[] = []
  ): Promise<{ linkedCount: number }> {
    return linkUserToMinedPersons(this.client, this.workspaceId, userId, userLogin, userEmails);
  }
}

/**
 * Links an authenticated User node to mined Person nodes via explicit [:IDENTIFIES] edges (TENANT-02, D-13, D-14).
 * Uses multi-factor matching: verified emails, hashed emails, noreply formats, and login names.
 */
export async function linkUserToMinedPersons(
  client: ArgonGraphClient,
  workspaceId: string,
  userId: string,
  userLogin: string,
  userEmails: string[] = []
): Promise<{ linkedCount: number }> {
  const normalizedLogin = userLogin.trim();
  const normalizedEmails = userEmails.map((e) => e.toLowerCase().trim()).filter(Boolean);

  const userEmailHashes = normalizedEmails.map(hashAuthorEmail);
  const noreply1 = `${normalizedLogin}@users.noreply.github.com`.toLowerCase();
  const noreply2 = `${userId}+${normalizedLogin}@users.noreply.github.com`.toLowerCase();
  userEmailHashes.push(hashAuthorEmail(noreply1));
  userEmailHashes.push(hashAuthorEmail(noreply2));

  const result = await client.query(workspaceId, queries.LINK_USER_TO_PERSONS_QUERY, {
    userId,
    userLogin: normalizedLogin,
    userEmails: normalizedEmails,
    userEmailHashes,
  });

  const record = (result as any)?.data?.[0] || (result as any)?.records?.[0];
  const count = record?.linked_count ?? (Array.isArray(record) ? record[0] : 0);

  return { linkedCount: Number(count) || 0 };
}
