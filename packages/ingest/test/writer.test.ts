import { describe, it, expect, vi } from 'vitest';
import type { ArgonGraphClient } from '@argon/graph';
import { FalkorIngestWriter } from '../src/writer/falkordb.js';
import * as queries from '../src/writer/queries.js';

describe('FalkorIngestWriter Unit Suite', () => {
  const workspaceId = 'ws_unit_test';

  function createMockClient() {
    const query = vi.fn().mockResolvedValue({ data: [] });
    return {
      query,
      roQuery: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as ArgonGraphClient & { query: ReturnType<typeof vi.fn> };
  }

  it('updates job status directly in FalkorDB with timestamp', async () => {
    const mockClient = createMockClient();
    const writer = new FalkorIngestWriter(mockClient, workspaceId);

    await writer.updateJobStatus('job_123', 'https://github.com/foo/bar', 'mining', 0.45);

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const [calledWs, cypher, params] = mockClient.query.mock.calls[0];
    expect(calledWs).toBe(workspaceId);
    expect(cypher).toBe(queries.UPDATE_JOB_STATUS);
    expect(params.jobId).toBe('job_123');
    expect(params.repoUrl).toBe('https://github.com/foo/bar');
    expect(params.status).toBe('mining');
    expect(params.progress).toBe(0.45);
    expect(params.error).toBeNull();
    expect(typeof params.updatedAt).toBe('number');
  });

  it('chunks batch items into configured size (default 500)', async () => {
    const mockClient = createMockClient();
    const writer = new FalkorIngestWriter(mockClient, workspaceId);

    const items = Array.from({ length: 1250 }, (_, i) => ({ id: `id_${i}` }));
    await writer.writeBatch('DUMMY_QUERY', items, 500);

    expect(mockClient.query).toHaveBeenCalledTimes(3);
    expect(mockClient.query.mock.calls[0][2].batch).toHaveLength(500);
    expect(mockClient.query.mock.calls[1][2].batch).toHaveLength(500);
    expect(mockClient.query.mock.calls[2][2].batch).toHaveLength(250);
  });

  it('skips query execution when batch is empty', async () => {
    const mockClient = createMockClient();
    const writer = new FalkorIngestWriter(mockClient, workspaceId);

    await writer.writeBatch('DUMMY_QUERY', []);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('correctly maps entity and relationship helper methods to openCypher queries', async () => {
    const mockClient = createMockClient();
    const writer = new FalkorIngestWriter(mockClient, workspaceId);

    await writer.writePersons([{ id: 'hash1', name: 'Alice' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_MERGE_PERSONS, {
      batch: [{ id: 'hash1', name: 'Alice' }],
    });

    await writer.writeFiles(['src/index.ts']);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_MERGE_FILES, {
      batch: [{ path: 'src/index.ts' }],
    });

    await writer.writePullRequests([
      { id: 'pr_1', title: 'feat: add stuff', merged_at: 1000, is_revert: false },
    ]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_MERGE_PULL_REQUESTS, {
      batch: [{ id: 'pr_1', title: 'feat: add stuff', merged_at: 1000, is_revert: false }],
    });

    await writer.writeComponents([{ name: 'packages/core' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_MERGE_COMPONENTS, {
      batch: [{ name: 'packages/core' }],
    });

    await writer.writeDecisions([
      {
        id: 'ADR-001',
        title: 'ADR-001',
        status: 'accepted',
        valid_from: 1000,
        valid_to: null,
        source_url: 'docs/adr/001.md',
        source_kind: 'adr',
        summary: 'Decision summary',
      },
    ]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_MERGE_DECISIONS, {
      batch: [
        {
          id: 'ADR-001',
          title: 'ADR-001',
          status: 'accepted',
          valid_from: 1000,
          valid_to: null,
          source_url: 'docs/adr/001.md',
          source_kind: 'adr',
          summary: 'Decision summary',
        },
      ],
    });

    await writer.writeTouchesEdges([{ pr_id: 'pr_1', file_path: 'src/index.ts' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_TOUCHES, {
      batch: [{ pr_id: 'pr_1', file_path: 'src/index.ts' }],
    });

    await writer.writeAuthoredEdges([{ author_id: 'hash1', pr_id: 'pr_1' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_AUTHORED, {
      batch: [{ author_id: 'hash1', pr_id: 'pr_1' }],
    });

    await writer.writeInComponentEdges([
      { file_path: 'src/index.ts', component_name: 'packages/core' },
    ]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_IN_COMPONENT, {
      batch: [{ file_path: 'src/index.ts', component_name: 'packages/core' }],
    });

    await writer.writeDependsOnEdges([
      { source: 'packages/core', target: 'packages/utils', weight: 0.8, count: 5 },
    ]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_DEPENDS_ON, {
      batch: [{ source: 'packages/core', target: 'packages/utils', weight: 0.8, count: 5 }],
    });

    await writer.writeCoChangesEdges([
      { source: 'src/a.ts', target: 'src/b.ts', weight: 0.5, count: 4 },
    ]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_CO_CHANGES, {
      batch: [{ source: 'src/a.ts', target: 'src/b.ts', weight: 0.5, count: 4 }],
    });

    await writer.writeRevertsEdges([{ revert_id: 'pr_2', reverted_id: 'pr_1' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_REVERTS, {
      batch: [{ revert_id: 'pr_2', reverted_id: 'pr_1' }],
    });

    await writer.writeSupersedesEdges([{ source_id: 'ADR-002', target_id: 'ADR-001' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_SUPERSEDES, {
      batch: [{ source_id: 'ADR-002', target_id: 'ADR-001' }],
    });

    await writer.writeGovernsEdges([{ decision_id: 'ADR-001', component_name: 'packages/core' }]);
    expect(mockClient.query).toHaveBeenLastCalledWith(workspaceId, queries.BATCH_EDGES_GOVERNS, {
      batch: [{ decision_id: 'ADR-001', component_name: 'packages/core' }],
    });
  });
});
