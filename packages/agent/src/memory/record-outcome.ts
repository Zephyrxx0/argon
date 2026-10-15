import { randomUUID } from 'node:crypto';
import type { ArgonGraphClient } from '@argon/graph';
import type { RecordOutcomeParams, RecordOutcomeResult } from './types.js';

export const CREATE_BRIEFING_NODE = `
MERGE (b:Briefing { id: $briefingId })
SET b.task = $task,
    b.summary = $summary,
    b.actor_id = $actorId,
    b.created_at = $createdAt,
    b.scope_hash = $scopeHash
RETURN b.id AS id
`;

export const LINK_BRIEFING_CITES = `
MATCH (b:Briefing { id: $briefingId })
UNWIND $batch AS citedId
MATCH (target) WHERE target.id = citedId OR target.path = citedId OR target.name = citedId
MERGE (b)-[:CITES]->(target)
`;

export const LINK_BRIEFING_ABOUT = `
MATCH (b:Briefing { id: $briefingId })
UNWIND $batch AS compName
MATCH (c:Component { name: compName })
MERGE (b)-[:ABOUT]->(c)
`;

export const LINK_BRIEFING_REQUESTED = `
MATCH (b:Briefing { id: $briefingId })
MATCH (p:Person { id: $contributorId })
MERGE (p)-[:REQUESTED]->(b)
`;

export async function recordOutcome(
  graphClient: ArgonGraphClient,
  params: RecordOutcomeParams
): Promise<RecordOutcomeResult> {
  const briefingId = randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  const actorId = params.contributorId ?? params.actorId ?? 'anonymous';
  const scopeHash = params.scopeHash ?? '';

  // 1. Create (:Briefing) node
  await graphClient.query(params.workspaceId, CREATE_BRIEFING_NODE, {
    briefingId,
    task: params.task,
    summary: params.summary,
    actorId,
    createdAt,
    scopeHash,
  });

  let citesCount = 0;
  let aboutCount = 0;
  let requestedCount = 0;

  // 2. Link [:CITES] edges for verified cited node IDs
  const uniqueCitedIds = Array.from(new Set(params.citedNodeIds.filter(Boolean)));
  if (uniqueCitedIds.length > 0) {
    await graphClient.query(params.workspaceId, LINK_BRIEFING_CITES, {
      briefingId,
      batch: uniqueCitedIds,
    });
    citesCount = uniqueCitedIds.length;
  }

  // 3. Link [:ABOUT] edges for affected components
  const uniqueComponents = Array.from(new Set(params.affectedComponents.filter(Boolean)));
  if (uniqueComponents.length > 0) {
    await graphClient.query(params.workspaceId, LINK_BRIEFING_ABOUT, {
      briefingId,
      batch: uniqueComponents,
    });
    aboutCount = uniqueComponents.length;
  }

  // 4. Link (:Person)-[:REQUESTED]->(:Briefing) if contributorId provided
  if (params.contributorId && params.contributorId.trim() !== '') {
    await graphClient.query(params.workspaceId, LINK_BRIEFING_REQUESTED, {
      briefingId,
      contributorId: params.contributorId,
    });
    requestedCount = 1;
  }

  return {
    briefingId,
    createdEdges: {
      cites: citesCount,
      about: aboutCount,
      requested: requestedCount,
    },
  };
}

