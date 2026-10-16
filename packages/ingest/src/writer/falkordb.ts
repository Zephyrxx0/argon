import type { ArgonGraphClient } from '@argon/graph';
import * as queries from './queries.js';
import { redactSecrets } from '../git/redact.js';

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
   * Executes a parameterized Cypher write in chunked batches (default 500 items).
   */
  async writeBatch<T>(query: string, items: T[], batchSize = 500): Promise<void> {
    if (items.length === 0) {
      return;
    }

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
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

  async writeRevertsEdges(edges: { revert_id: string; reverted_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_REVERTS, edges);
  }

  async writeSupersedesEdges(edges: { source_id: string; target_id: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_SUPERSEDES, edges);
  }

  async writeGovernsEdges(edges: { decision_id: string; component_name: string }[]): Promise<void> {
    await this.writeBatch(queries.BATCH_EDGES_GOVERNS, edges);
  }
}
