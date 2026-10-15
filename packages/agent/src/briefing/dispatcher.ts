import type { GatewayClient } from '../client/types.js';
import type {
  ResolvedScope,
  RetrievalResult,
  EvidenceBundle,
  TouchedFileItem,
  BlastComponentItem,
  KeyOwnerItem,
  ConstrainingDecisionItem,
  PrecedentItem,
} from './types.js';

export async function dispatchRetrievalBundle(
  client: GatewayClient,
  workspaceId: string,
  scope: ResolvedScope
): Promise<RetrievalResult> {
  const blastPromise =
    scope.files.length > 0
      ? client.executeQuery(workspaceId, 'blastRadius', {
          files: scope.files,
          maxDepth: 3,
        })
      : Promise.resolve({ raw: [], graph: { nodes: [], edges: [] }, evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] } });

  const whoKnowsPromise =
    scope.components.length > 0
      ? client.executeQuery(workspaceId, 'whoKnows', {
          components: scope.components,
        })
      : Promise.resolve({ raw: [], graph: { nodes: [], edges: [] }, evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] } });

  const constrainingPromise =
    scope.files.length > 0
      ? client.executeQuery(workspaceId, 'constrainingDecisions', {
          files: scope.files,
          asOf: scope.asOf,
        })
      : Promise.resolve({ raw: [], graph: { nodes: [], edges: [] }, evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] } });

  const precedentPromise =
    scope.queryVector && scope.queryVector.length === 512
      ? client.executeQuery(workspaceId, 'precedentSearch', {
          queryVector: scope.queryVector,
          limit: 5,
        })
      : Promise.resolve({ raw: [], graph: { nodes: [], edges: [] }, evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] } });

  const [blastSettled, whoKnowsSettled, constrainingSettled, precedentSettled] =
    await Promise.allSettled([
      blastPromise,
      whoKnowsPromise,
      constrainingPromise,
      precedentPromise,
    ]);

  // If queries were dispatched and all of them were rejected (e.g. database unreachable / kill switch),
  // immediately fail closed with NO_GRAPH_DATA per PRD §3.3 & §7.4
  const dispatchedQueries = [
    scope.files.length > 0 ? blastSettled : null,
    scope.components.length > 0 ? whoKnowsSettled : null,
    scope.files.length > 0 ? constrainingSettled : null,
    scope.queryVector && scope.queryVector.length === 512 ? precedentSettled : null,
  ].filter((s): s is PromiseSettledResult<any> => s !== null);

  if (dispatchedQueries.length > 0 && dispatchedQueries.every((s) => s.status === 'rejected')) {
    return {
      status: 'NO_GRAPH_DATA',
      reason: 'Graph database query failed or database unreachable: no graph, no answer.',
    };
  }

  const allNodeIds = new Set<string>();
  const mergedNodesMap = new Map<string, any>();
  const mergedEdgesMap = new Map<string, any>();

  function ingestGraphPayload(payload?: any) {
    if (!payload?.graph) return;
    if (payload.evidence?.primaryIds) {
      for (const id of payload.evidence.primaryIds) {
        if (id) allNodeIds.add(String(id));
      }
    }
    for (const node of payload.graph.nodes ?? []) {
      if (node?.data?.id) {
        allNodeIds.add(String(node.data.id));
        mergedNodesMap.set(String(node.data.id), node);
      }
    }
    for (const edge of payload.graph.edges ?? []) {
      if (edge?.data?.id) {
        mergedEdgesMap.set(String(edge.data.id), edge);
      }
    }
  }

  // 1. Process Blast Radius
  const touchedFiles: TouchedFileItem[] = [];
  const blastComponents: BlastComponentItem[] = [];
  const seenFiles = new Set<string>();
  const seenBlastComponents = new Set<string>();

  if (blastSettled.status === 'fulfilled') {
    ingestGraphPayload(blastSettled.value);
    const raw = (blastSettled.value.raw ?? []) as any[];
    for (const row of raw) {
      const fPath = row.f?.path ?? row.f?.properties?.path;
      const cName = row.c?.name ?? row.c?.properties?.name;
      if (fPath && !seenFiles.has(fPath)) {
        seenFiles.add(fPath);
        touchedFiles.push({ path: fPath, component: cName });
        allNodeIds.add(fPath);
      }
      if (cName) {
        allNodeIds.add(cName);
      }

      const downstreamName =
        row.downstream?.name ?? row.downstream?.properties?.name;
      if (downstreamName && !seenBlastComponents.has(downstreamName)) {
        seenBlastComponents.add(downstreamName);
        blastComponents.push({
          component: downstreamName,
          downstreamOf: cName,
        });
        allNodeIds.add(downstreamName);
      }
    }
  }

  // Fallback: if touchedFiles is empty but scope.files had items, populate them
  if (touchedFiles.length === 0 && scope.files.length > 0) {
    for (const p of scope.files) {
      if (!seenFiles.has(p)) {
        seenFiles.add(p);
        touchedFiles.push({ path: p });
        allNodeIds.add(p);
      }
    }
  }

  // Fallback: if blastComponents is empty but scope.components had items
  if (blastComponents.length === 0 && scope.components.length > 0) {
    for (const c of scope.components) {
      if (!seenBlastComponents.has(c)) {
        seenBlastComponents.add(c);
        blastComponents.push({ component: c });
        allNodeIds.add(c);
      }
    }
  }

  // 2. Process Who Knows
  const keyOwnersMap = new Map<string, KeyOwnerItem>();
  if (whoKnowsSettled.status === 'fulfilled') {
    ingestGraphPayload(whoKnowsSettled.value);
    const raw = (whoKnowsSettled.value.raw ?? []) as any[];
    for (const row of raw) {
      const comp = row.component;
      if (row.authorId) {
        const id = String(row.authorId);
        allNodeIds.add(id);
        const existing = keyOwnersMap.get(id) ?? {
          personId: id,
          name: row.authorName ?? id,
          component: comp,
          authoredCount: 0,
          reviewedCount: 0,
        };
        existing.authoredCount += Number(row.authoredCount ?? 0);
        keyOwnersMap.set(id, existing);
      }
      if (row.reviewerId) {
        const id = String(row.reviewerId);
        allNodeIds.add(id);
        const existing = keyOwnersMap.get(id) ?? {
          personId: id,
          name: row.reviewerName ?? id,
          component: comp,
          authoredCount: 0,
          reviewedCount: 0,
        };
        existing.reviewedCount += Number(row.reviewedCount ?? 0);
        keyOwnersMap.set(id, existing);
      }
    }
  }

  const keyOwners: KeyOwnerItem[] = Array.from(keyOwnersMap.values()).sort(
    (a, b) => b.authoredCount + b.reviewedCount - (a.authoredCount + a.reviewedCount)
  );

  // 3. Process Constraining Decisions
  const constrainingDecisions: ConstrainingDecisionItem[] = [];
  const seenDecisions = new Set<string>();
  if (constrainingSettled.status === 'fulfilled') {
    ingestGraphPayload(constrainingSettled.value);
    const raw = (constrainingSettled.value.raw ?? []) as any[];
    for (const row of raw) {
      const dId = String(row.id);
      if (dId && !seenDecisions.has(dId)) {
        seenDecisions.add(dId);
        allNodeIds.add(dId);
        constrainingDecisions.push({
          decisionId: dId,
          title: String(row.title ?? dId),
          component: String(row.component ?? ''),
          status: String(row.status ?? 'ACCEPTED'),
          sourceUrl: row.sourceUrl ? String(row.sourceUrl) : undefined,
        });
      }
    }
  }

  // 4. Process Precedent Search with similarity cutoff >= 0.60
  const precedents: PrecedentItem[] = [];
  if (precedentSettled.status === 'fulfilled') {
    ingestGraphPayload(precedentSettled.value);
    const raw = (precedentSettled.value.raw ?? []) as any[];
    for (const row of raw) {
      const score = Number(row.score ?? 0);
      if (score >= 0.60) {
        const d = row.decision;
        const dId = String(d?.id ?? d?.properties?.id ?? '');
        const title = String(d?.title ?? d?.properties?.title ?? dId);
        const comp = row.component?.name ?? row.component?.properties?.name;
        const pr = row.pullRequest?.number ?? row.pullRequest?.properties?.number;

        if (dId) {
          allNodeIds.add(dId);
        }
        precedents.push({
          decisionId: dId,
          title,
          similarityScore: score,
          component: comp,
          pullRequest: pr ? String(pr) : undefined,
        });
      }
    }
  }

  // Pre-narration short-circuit check per D-12:
  // If 0 files, 0 components, and 0 decisions were found, short-circuit immediately
  if (
    touchedFiles.length === 0 &&
    blastComponents.length === 0 &&
    constrainingDecisions.length === 0 &&
    precedents.length === 0
  ) {
    return {
      status: 'NO_GRAPH_DATA',
      reason: 'No matching graph entities found for the requested scope.',
    };
  }

  // Apply hard count caps conforming to D-08:
  // max 15 files, max 5 blast components, top 5 owners, top 5 decisions, top 3 precedents
  const boundedBundle: EvidenceBundle = {
    touchedFiles: touchedFiles.slice(0, 15),
    blastComponents: blastComponents.slice(0, 5),
    keyOwners: keyOwners.slice(0, 5),
    constrainingDecisions: constrainingDecisions.slice(0, 5),
    precedents: precedents.slice(0, 3),
    allNodeIds,
    cytoscapeElements: [
      ...Array.from(mergedNodesMap.values()),
      ...Array.from(mergedEdgesMap.values()),
    ],
  };

  return {
    status: 'SUCCESS',
    bundle: boundedBundle,
  };
}

