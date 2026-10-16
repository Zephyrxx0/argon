import { describe, it, expect, vi } from 'vitest';
import {
  INCREMENTAL_SYNC_COMMITS_QUERY,
  UPDATE_ROLLING_COUPLING_QUERY,
  ADVANCE_ADR_SUPERSEDED_QUERY,
  UPSERT_DECISION_QUERY,
  LINK_REVERT_COMMIT_QUERY,
  executeIncrementalSyncCommits,
  executeRollingCouplingUpdate,
  executeAdvanceAdrSuperseded,
  executeUpsertDecision,
} from '../../src/queries/sync';

describe('Incremental Sync Queries (Task 08-02-01, SYNC-02, SYNC-03)', () => {
  it('defines valid parameterized openCypher query strings', () => {
    expect(INCREMENTAL_SYNC_COMMITS_QUERY).toContain('UNWIND $commits AS c');
    expect(INCREMENTAL_SYNC_COMMITS_QUERY).toContain('MERGE (cm:Commit { id: c.sha })');
    expect(INCREMENTAL_SYNC_COMMITS_QUERY).toContain('SET rf.deleted = true');

    expect(UPDATE_ROLLING_COUPLING_QUERY).toContain('UNWIND $pairs AS pair');
    expect(UPDATE_ROLLING_COUPLING_QUERY).toContain('MERGE (f1)-[r:CO_CHANGES_WITH]-(f2)');

    expect(ADVANCE_ADR_SUPERSEDED_QUERY).toContain('SET old.valid_to = $mergedAt, old.status = \'superseded\'');
    expect(ADVANCE_ADR_SUPERSEDED_QUERY).toContain('MERGE (new)-[:SUPERSEDES]->(old)');

    expect(UPSERT_DECISION_QUERY).toContain('MERGE (d:Decision { id: $id, workspace_id: $workspaceId })');
    expect(UPSERT_DECISION_QUERY).toContain('MERGE (d)-[:GOVERNS]->(f)');

    expect(LINK_REVERT_COMMIT_QUERY).toContain('MERGE (cm)-[:REVERTS]->(target)');
  });

  it('executeIncrementalSyncCommits calls graphClient.query with formatted parameters', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await executeIncrementalSyncCommits(mockClient as any, {
      workspaceId: 'test-ws',
      commits: [
        {
          sha: 'c1',
          message: 'feat: add something',
          authorEmail: 'alice@example.com',
          authorName: 'Alice',
          timestamp: 1700000000,
          added: ['src/a.ts'],
          modified: ['src/b.ts'],
          removed: ['src/c.ts'],
        },
      ],
    });

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      'test-ws',
      INCREMENTAL_SYNC_COMMITS_QUERY,
      expect.objectContaining({
        workspaceId: 'test-ws',
        commits: expect.arrayContaining([
          expect.objectContaining({ sha: 'c1', authorName: 'Alice' }),
        ]),
      }),
    );
  });

  it('executeIncrementalSyncCommits links revert commits when revertsSha is present', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await executeIncrementalSyncCommits(mockClient as any, {
      workspaceId: 'test-ws',
      commits: [
        {
          sha: 'c2',
          message: 'Revert "feat: add something"',
          authorEmail: 'bob@example.com',
          authorName: 'Bob',
          timestamp: 1700000010,
          added: [],
          modified: ['src/b.ts'],
          removed: [],
          revertsSha: 'c1',
        },
      ],
    });

    expect(mockClient.query).toHaveBeenCalledTimes(2);
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'test-ws',
      LINK_REVERT_COMMIT_QUERY,
      {
        workspaceId: 'test-ws',
        sha: 'c2',
        revertsSha: 'c1',
      },
    );
  });

  it('executeRollingCouplingUpdate dispatches pairwise updates', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await executeRollingCouplingUpdate(mockClient as any, {
      workspaceId: 'test-ws',
      pairs: [
        { fileA: 'src/a.ts', fileB: 'src/b.ts' },
        { fileA: 'src/b.ts', fileB: 'src/c.ts' },
      ],
    });

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      'test-ws',
      UPDATE_ROLLING_COUPLING_QUERY,
      {
        workspaceId: 'test-ws',
        pairs: [
          { fileA: 'src/a.ts', fileB: 'src/b.ts' },
          { fileA: 'src/b.ts', fileB: 'src/c.ts' },
        ],
      },
    );
  });

  it('executeAdvanceAdrSuperseded updates valid_to, valid_from and creates :SUPERSEDES', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await executeAdvanceAdrSuperseded(mockClient as any, {
      workspaceId: 'test-ws',
      oldDecisionId: 'adr-0004',
      newDecisionId: 'adr-0005',
      mergedAt: '2026-10-16T12:00:00Z',
    });

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      'test-ws',
      ADVANCE_ADR_SUPERSEDED_QUERY,
      {
        workspaceId: 'test-ws',
        oldDecisionId: 'adr-0004',
        newDecisionId: 'adr-0005',
        mergedAt: '2026-10-16T12:00:00Z',
      },
    );
  });

  it('executeUpsertDecision upserts decision with vector embedding and governed files', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await executeUpsertDecision(mockClient as any, {
      workspaceId: 'test-ws',
      id: 'adr-0006',
      title: 'ADR-0006: Webhook Sync',
      problem: 'Need real-time sync',
      decision: 'Use SSE and webhooks',
      status: 'accepted',
      validFrom: '2026-10-16T12:00:00Z',
      validTo: null,
      embedding: new Array(512).fill(0.1),
      files: ['apps/gateway/src/routes/webhooks.ts'],
    });

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      'test-ws',
      UPSERT_DECISION_QUERY,
      expect.objectContaining({
        workspaceId: 'test-ws',
        id: 'adr-0006',
        title: 'ADR-0006: Webhook Sync',
        files: ['apps/gateway/src/routes/webhooks.ts'],
      }),
    );
  });
});
