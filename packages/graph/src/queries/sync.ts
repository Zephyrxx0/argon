import type { ArgonGraphClient } from '../client.js';

export interface IncrementalCommitInput {
  sha: string;
  message: string;
  authorEmail: string;
  authorName: string;
  timestamp: number | string;
  added: string[];
  modified: string[];
  removed: string[];
  revertsSha?: string;
}

export interface IncrementalSyncCommitsParams {
  workspaceId: string;
  commits: IncrementalCommitInput[];
}

export interface RollingCouplingPair {
  fileA: string;
  fileB: string;
}

export interface RollingCouplingParams {
  workspaceId: string;
  pairs: RollingCouplingPair[];
}

export interface AdvanceAdrSupersededParams {
  workspaceId: string;
  oldDecisionId: string;
  newDecisionId: string;
  mergedAt: string | number;
}

export interface UpsertDecisionParams {
  workspaceId: string;
  id: string;
  title: string;
  problem: string;
  decision: string;
  status: string;
  validFrom: string | number;
  validTo: string | number | null;
  embedding: number[];
  files: string[];
}

export const INCREMENTAL_SYNC_COMMITS_QUERY = `
UNWIND $commits AS c
MERGE (w:Workspace { id: $workspaceId })
MERGE (p:Person { email: c.authorEmail, name: c.authorName })
MERGE (cm:Commit { id: c.sha })
SET cm.message = c.message,
    cm.timestamp = c.timestamp,
    cm.workspace_id = $workspaceId
MERGE (p)-[:AUTHORED]->(cm)
MERGE (cm)-[:IN_WORKSPACE]->(w)
WITH c, cm, w
FOREACH (path IN c.added |
  MERGE (f:File { path: path, workspace_id: $workspaceId })
  MERGE (cm)-[:TOUCHES { change_type: 'added' }]->(f)
)
FOREACH (path IN c.modified |
  MERGE (f:File { path: path, workspace_id: $workspaceId })
  MERGE (cm)-[:TOUCHES { change_type: 'modified' }]->(f)
)
FOREACH (path IN c.removed |
  MERGE (rf:File { path: path, workspace_id: $workspaceId })
  SET rf.deleted = true, rf.deleted_at = c.timestamp
  MERGE (cm)-[:TOUCHES { change_type: 'deleted' }]->(rf)
)
`;

export const LINK_REVERT_COMMIT_QUERY = `
MATCH (cm:Commit { id: $sha, workspace_id: $workspaceId })
MATCH (target:Commit { id: $revertsSha, workspace_id: $workspaceId })
MERGE (cm)-[:REVERTS]->(target)
`;

export const UPDATE_ROLLING_COUPLING_QUERY = `
UNWIND $pairs AS pair
MATCH (f1:File { path: pair.fileA, workspace_id: $workspaceId })
MATCH (f2:File { path: pair.fileB, workspace_id: $workspaceId })
MERGE (f1)-[r:CO_CHANGES_WITH]-(f2)
ON CREATE SET r.count = 1, r.weight = 0.1
ON MATCH SET r.count = r.count + 1, r.weight = round((r.count * 1.0) / (r.count + 5) * 100) / 100
`;

export const ADVANCE_ADR_SUPERSEDED_QUERY = `
MATCH (old:Decision { id: $oldDecisionId, workspace_id: $workspaceId })
SET old.valid_to = $mergedAt, old.status = 'superseded'
WITH old
MATCH (new:Decision { id: $newDecisionId, workspace_id: $workspaceId })
SET new.valid_from = $mergedAt
MERGE (new)-[:SUPERSEDES]->(old)
`;

export const UPSERT_DECISION_QUERY = `
MERGE (d:Decision { id: $id, workspace_id: $workspaceId })
SET d.title = $title,
    d.problem = $problem,
    d.decision = $decision,
    d.status = $status,
    d.valid_from = $validFrom,
    d.valid_to = $validTo,
    d.embedding = vecf32($embedding)
WITH d
UNWIND $files AS filePath
MERGE (f:File { path: filePath, workspace_id: $workspaceId })
MERGE (d)-[:GOVERNS]->(f)
`;

export async function executeIncrementalSyncCommits(
  graphClient: ArgonGraphClient,
  params: IncrementalSyncCommitsParams,
): Promise<void> {
  if (params.commits.length === 0) {
    return;
  }

  await graphClient.query(params.workspaceId, INCREMENTAL_SYNC_COMMITS_QUERY, {
    workspaceId: params.workspaceId,
    commits: params.commits,
  });

  // Link reverts if any commit is a revert
  for (const commit of params.commits) {
    if (commit.revertsSha) {
      await graphClient.query(params.workspaceId, LINK_REVERT_COMMIT_QUERY, {
        workspaceId: params.workspaceId,
        sha: commit.sha,
        revertsSha: commit.revertsSha,
      });
    }
  }
}

export async function executeRollingCouplingUpdate(
  graphClient: ArgonGraphClient,
  params: RollingCouplingParams,
): Promise<void> {
  if (params.pairs.length === 0) {
    return;
  }

  await graphClient.query(params.workspaceId, UPDATE_ROLLING_COUPLING_QUERY, {
    workspaceId: params.workspaceId,
    pairs: params.pairs,
  });
}

export async function executeAdvanceAdrSuperseded(
  graphClient: ArgonGraphClient,
  params: AdvanceAdrSupersededParams,
): Promise<void> {
  await graphClient.query(params.workspaceId, ADVANCE_ADR_SUPERSEDED_QUERY, {
    workspaceId: params.workspaceId,
    oldDecisionId: params.oldDecisionId,
    newDecisionId: params.newDecisionId,
    mergedAt: params.mergedAt,
  });
}

export async function executeUpsertDecision(
  graphClient: ArgonGraphClient,
  params: UpsertDecisionParams,
): Promise<void> {
  await graphClient.query(params.workspaceId, UPSERT_DECISION_QUERY, {
    workspaceId: params.workspaceId,
    id: params.id,
    title: params.title,
    problem: params.problem,
    decision: params.decision,
    status: params.status,
    validFrom: params.validFrom,
    validTo: params.validTo,
    embedding: params.embedding,
    files: params.files.length > 0 ? params.files : [''],
  });
}
