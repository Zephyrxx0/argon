import { ArgonEmbedder, type ArgonGraphClient } from '@argon/graph';
import type { GatewayClient, BriefingRequest, BriefingResponse } from '../client/types.js';
import { resolveBriefingScope } from './resolver.js';
import { dispatchRetrievalBundle } from './dispatcher.js';
import { narrateBriefing } from './narrator.js';
import { validateCitationIntegrity } from '../citations/validator.js';
import { recordOutcome } from '../memory/record-outcome.js';

export interface BriefingPipelineOptions {
  client: GatewayClient;
  graphClient?: ArgonGraphClient;
  embedder?: ArgonEmbedder;
  workspaceId: string;
  request: BriefingRequest;
  customGenerator?: (prompt: string) => Promise<unknown>;
}

export async function executeBriefingPipeline(
  options: BriefingPipelineOptions
): Promise<BriefingResponse> {
  const { client, graphClient, workspaceId, request } = options;
  const embedder = options.embedder ?? new ArgonEmbedder();

  // 1. Resolve Scope (D-05, D-07)
  const resolvedScope = await resolveBriefingScope(
    client,
    embedder,
    workspaceId,
    {
      task: request.task,
      files: request.files,
      components: request.components,
      asOf: request.asOf,
      contributorId: request.contributorId,
      anonymousSessionId: request.anonymousSessionId,
    }
  );

  // 2. Dispatch Retrieval Bundle (D-06, D-08)
  const retrievalResult = await dispatchRetrievalBundle(
    client,
    workspaceId,
    resolvedScope
  );

  // 3. Short-circuit on NO_GRAPH_DATA (D-12)
  if (retrievalResult.status === 'NO_GRAPH_DATA' || !retrievalResult.bundle) {
    return {
      status: 'NO_GRAPH_DATA',
      reason: retrievalResult.reason ?? 'No matching graph entities found for the requested scope.',
      briefing: null,
      evidence: { nodeCount: 0, verifiedCitationCount: 0 },
    };
  }

  const bundle = retrievalResult.bundle;

  // 4. Narrate Briefing with 1-step repair loop (D-09, D-10)
  const rawBriefing = await narrateBriefing(request.task, bundle, {
    customGenerator: options.customGenerator,
  });

  // 5. Validate Citation Integrity (D-13, D-14)
  const fallbackCheck = graphClient
    ? async (id: string): Promise<boolean> => {
        try {
          const cypher =
            'MATCH (n) WHERE n.id = $id OR n.path = $id OR n.name = $id RETURN count(n) AS cnt LIMIT 1';
          const res = await graphClient.roQuery(workspaceId, cypher, { id });
          const count = Number((res.data?.[0] as any)?.cnt ?? 0);
          return count > 0;
        } catch {
          return false;
        }
      }
    : undefined;

  const citationResult = await validateCitationIntegrity(
    rawBriefing,
    bundle.allNodeIds,
    fallbackCheck
  );

  // 6. Refusal check on citation failure (D-14)
  if (
    citationResult.status === 'CITATION_INTEGRITY_FAILURE' ||
    !citationResult.verifiedBriefing
  ) {
    return {
      status: 'CITATION_INTEGRITY_FAILURE',
      reason: citationResult.failureReason ?? 'Citation integrity verification failed.',
      briefing: null,
      evidence: {
        totalCitedCount: citationResult.totalCitedCount,
        verifiedCitationCount: 0,
        strippedClaimCount: citationResult.strippedClaimCount,
      },
    };
  }

  const verifiedBriefing = citationResult.verifiedBriefing;

  // 7. Write-back Memory: record_outcome (D-15, D-16)
  let briefingId = '';
  if (graphClient) {
    try {
      const affectedComponentNames = verifiedBriefing.blastRadius.affectedComponents.map(
        (c) => c.component
      );
      const outcome = await recordOutcome(graphClient, {
        workspaceId,
        task: request.task,
        summary: verifiedBriefing.summary.overview,
        actorId: request.anonymousSessionId,
        contributorId: request.contributorId,
        citedNodeIds: citationResult.verifiedNodeIds,
        affectedComponents: affectedComponentNames,
      });
      briefingId = outcome.briefingId;
    } catch (err: any) {
      console.warn(`[Pipeline] Failed to write-back briefing memory: ${err?.message}`);
    }
  }

  // 8. Return successful response
  return {
    status: 'SUCCESS',
    briefingId,
    briefing: verifiedBriefing,
    evidence: {
      totalCitedCount: citationResult.totalCitedCount,
      verifiedCitationCount: citationResult.verifiedCitationCount,
      strippedClaimCount: citationResult.strippedClaimCount,
      verifiedNodeIds: citationResult.verifiedNodeIds,
    },
  };
}
