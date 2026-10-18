import type { GatewayClient, QueryName } from '../client/types.js';
import { QUERY_TO_TOOL_NAME, summarizeArgs, type ToolTraceEntry } from '../tools/trace.js';
import type {
  ResolvedScope,
  RetrievalResult,
  EvidenceBundle,
  TouchedFileItem,
  BlastComponentItem,
  KeyOwnerItem,
  CodeOwnerItem,
  ConstrainingDecisionItem,
  PrecedentItem,
  RevertItem,
  RiskRankItem,
} from './types.js';
import { aggregateWhoKnows, pullRequestRef, SourceCollector } from './provenance.js';

/**
 * Domain id of a graph node. A raw FalkorDB node carries an internal numeric `id` next to its
 * `properties`, so the domain id (`properties.id`) must win; flat objects fall back to `.id`.
 */
function domainId(node: any): string {
  const v = node?.properties?.id ?? node?.id;
  return v == null ? '' : String(v);
}

export async function dispatchRetrievalBundle(
  client: GatewayClient,
  workspaceId: string,
  scope: ResolvedScope
): Promise<RetrievalResult> {
  const EMPTY_PAYLOAD = {
    raw: [],
    graph: { nodes: [], edges: [] },
    evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] },
  };
  const trace: ToolTraceEntry[] = [];

  /** Runs one graph query and records it in the tool trace (step 0 = fixed pipeline). */
  async function traced(queryName: QueryName, params: Record<string, unknown>): Promise<any> {
    const tool = QUERY_TO_TOOL_NAME[queryName];
    const started = Date.now();
    try {
      const res: any = await client.executeQuery(workspaceId, queryName as any, params as any);
      trace.push({
        step: 0,
        source: 'pipeline',
        tool,
        args: summarizeArgs(params),
        status: 'ok',
        rowCount: Array.isArray(res?.raw) ? res.raw.length : 0,
        evidenceIds: res?.evidence?.primaryIds?.length ?? 0,
        durationMs: Date.now() - started,
      });
      return res;
    } catch (err: any) {
      trace.push({
        step: 0,
        source: 'pipeline',
        tool,
        args: summarizeArgs(params),
        status: 'error',
        rowCount: 0,
        evidenceIds: 0,
        durationMs: Date.now() - started,
        note: String(err?.message ?? err).slice(0, 200),
      });
      throw err;
    }
  }

  function skipped(queryName: QueryName, note: string): Promise<any> {
    trace.push({
      step: 0,
      source: 'pipeline',
      tool: QUERY_TO_TOOL_NAME[queryName],
      args: {},
      status: 'skipped',
      rowCount: 0,
      evidenceIds: 0,
      durationMs: 0,
      note,
    });
    return Promise.resolve(EMPTY_PAYLOAD);
  }

  const hasFiles = scope.files.length > 0;
  const hasComponents = scope.components.length > 0;
  const hasVector = Boolean(scope.queryVector && scope.queryVector.length === 512);

  const blastPromise = hasFiles
    ? traced('blastRadius', { files: scope.files, maxDepth: 3 })
    : skipped('blastRadius', 'no files in scope');

  const whoKnowsPromise = hasComponents
    ? traced('whoKnows', { components: scope.components })
    : skipped('whoKnows', 'no components in scope');

  const constrainingPromise = hasFiles
    ? traced('constrainingDecisions', { files: scope.files, asOf: scope.asOf })
    : skipped('constrainingDecisions', 'no files in scope');

  const precedentPromise = hasVector
    ? traced('precedentSearch', { queryVector: scope.queryVector, limit: 5 })
    : skipped('precedentSearch', 'no query embedding available');

  const revertPromise = hasFiles
    ? traced('revertHistory', { files: scope.files, limit: 20 })
    : skipped('revertHistory', 'no files in scope');

  const riskPromise =
    hasFiles || hasComponents
      ? traced('riskRanking', { limit: 5 })
      : skipped('riskRanking', 'nothing in scope to rank');

  const [
    blastSettled,
    whoKnowsSettled,
    constrainingSettled,
    precedentSettled,
    revertSettled,
    riskSettled,
  ] = await Promise.allSettled([
    blastPromise,
    whoKnowsPromise,
    constrainingPromise,
    precedentPromise,
    revertPromise,
    riskPromise,
  ]);

  // If queries were dispatched and all of them were rejected (e.g. database unreachable / kill switch),
  // immediately fail closed with NO_GRAPH_DATA per PRD §3.3 & §7.4
  const dispatchedQueries = [
    hasFiles ? blastSettled : null,
    hasComponents ? whoKnowsSettled : null,
    hasFiles ? constrainingSettled : null,
    hasVector ? precedentSettled : null,
    hasFiles ? revertSettled : null,
    hasFiles || hasComponents ? riskSettled : null,
  ].filter((s): s is PromiseSettledResult<any> => s !== null);

  if (dispatchedQueries.length > 0 && dispatchedQueries.every((s) => s.status === 'rejected')) {
    return {
      status: 'NO_GRAPH_DATA',
      reason: 'Graph database query failed or database unreachable: no graph, no answer.',
      trace,
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

  // 2. Process Who Knows (authored / reviewed / CODEOWNERS rows, aggregated per person)
  const sourceCollector = new SourceCollector();
  let keyOwners: KeyOwnerItem[] = [];
  let codeOwners: CodeOwnerItem[] = [];
  if (whoKnowsSettled.status === 'fulfilled') {
    ingestGraphPayload(whoKnowsSettled.value);
    const aggregate = aggregateWhoKnows((whoKnowsSettled.value.raw ?? []) as any[]);
    keyOwners = aggregate.keyOwners;
    codeOwners = aggregate.codeOwners;
    for (const id of aggregate.nodeIds) allNodeIds.add(id);
  }

  // 3. Process Constraining Decisions (+ provenance: originating PR and the issue it closed)
  const constrainingDecisions: ConstrainingDecisionItem[] = [];
  const decisionById = new Map<string, ConstrainingDecisionItem>();
  if (constrainingSettled.status === 'fulfilled') {
    ingestGraphPayload(constrainingSettled.value);
    const raw = (constrainingSettled.value.raw ?? []) as any[];
    for (const row of raw) {
      const dId = String(row.id);
      if (!dId) continue;
      let item = decisionById.get(dId);
      if (!item) {
        allNodeIds.add(dId);
        item = {
          decisionId: dId,
          title: String(row.title ?? dId),
          component: String(row.component ?? ''),
          status: String(row.status ?? 'ACCEPTED'),
          sourceUrl: row.sourceUrl ? String(row.sourceUrl) : undefined,
          validFrom: row.validFrom != null && Number.isFinite(Number(row.validFrom)) ? Number(row.validFrom) : undefined,
          sourceKind: row.sourceKind ? String(row.sourceKind) : undefined,
          synthetic: row.synthetic === true ? true : undefined,
          sourceChannel: row.sourceChannel ? String(row.sourceChannel) : undefined,
        };
        decisionById.set(dId, item);
        constrainingDecisions.push(item);
        sourceCollector.addDecisionOrigin(dId, item.title, item.sourceUrl, {
          sourceKind: item.sourceKind,
          synthetic: item.synthetic,
          channel: item.sourceChannel,
        });
      }
      if (row.prId) {
        const prId = String(row.prId);
        allNodeIds.add(prId);
        item.pullRequestId ??= prId;
        item.pullRequestNumber ??= row.prNumber != null ? Number(row.prNumber) : undefined;
        item.pullRequestUrl ??= row.prUrl ? String(row.prUrl) : undefined;
        sourceCollector.addPullRequest(dId, { id: prId, number: row.prNumber, url: row.prUrl });
      }
      if (row.issueId) {
        const issueId = String(row.issueId);
        allNodeIds.add(issueId);
        item.issueId ??= issueId;
        item.issueNumber ??= row.issueNumber != null ? Number(row.issueNumber) : undefined;
        item.issueUrl ??= row.issueUrl ? String(row.issueUrl) : undefined;
        sourceCollector.addIssue(dId, {
          id: issueId,
          number: row.issueNumber,
          url: row.issueUrl,
          state: row.issueState,
        });
      }
    }
  }

  // 4. Process Precedent Search with similarity cutoff >= 0.60
  //    (one entry per decision: the query repeats a decision once per governed component / issue)
  const precedents: PrecedentItem[] = [];
  const precedentById = new Map<string, PrecedentItem>();
  if (precedentSettled.status === 'fulfilled') {
    ingestGraphPayload(precedentSettled.value);
    const raw = (precedentSettled.value.raw ?? []) as any[];
    for (const row of raw) {
      const score = Number(row.score ?? 0);
      if (score < 0.60) continue;
      const d = row.decision;
      const dId = domainId(d);
      if (!dId) continue;
      const props = d?.properties ?? d ?? {};
      const comp = row.component?.name ?? row.component?.properties?.name;
      const pr = row.pullRequest?.properties ?? row.pullRequest;
      const issue = row.issue?.properties ?? row.issue;

      let item = precedentById.get(dId);
      if (!item) {
        allNodeIds.add(dId);
        const decisionStatus = props.status;
        item = {
          decisionId: dId,
          title: String(props.title ?? dId),
          similarityScore: score,
          component: comp,
          status: decisionStatus ? String(decisionStatus) : undefined,
          sourceKind: props.source_kind ? String(props.source_kind) : undefined,
          synthetic: props.synthetic === true ? true : undefined,
          sourceChannel: props.source_channel ? String(props.source_channel) : undefined,
          validFrom:
            props.valid_from != null && Number.isFinite(Number(props.valid_from)) ? Number(props.valid_from) : undefined,
        };
        precedentById.set(dId, item);
        precedents.push(item);
        sourceCollector.addDecisionOrigin(dId, item.title, props.source_url, {
          sourceKind: item.sourceKind,
          synthetic: item.synthetic,
          channel: item.sourceChannel,
        });
      }
      if (!item.component && comp) item.component = comp;

      const prId = pr?.id != null ? String(pr.id) : '';
      if (!prId && pr?.number != null && !item.pullRequest) {
        item.pullRequest = pullRequestRef(pr.number, '');
      }
      if (prId && !item.pullRequestId) {
        allNodeIds.add(prId);
        item.pullRequestId = prId;
        item.pullRequest = pullRequestRef(pr.number, prId);
        item.pullRequestUrl = pr.url ? String(pr.url) : undefined;
        sourceCollector.addPullRequest(dId, pr);
      }
      const issueId = issue?.id != null ? String(issue.id) : '';
      if (issueId && !item.issueId) {
        allNodeIds.add(issueId);
        item.issueId = issueId;
        item.issueNumber = issue.number != null ? Number(issue.number) : undefined;
        item.issueUrl = issue.url ? String(issue.url) : undefined;
        sourceCollector.addIssue(dId, issue);
      }
    }
  }

  // 5. Process Revert History (revert commits that touched the scope files)
  const reverts: RevertItem[] = [];
  if (revertSettled.status === 'fulfilled') {
    ingestGraphPayload(revertSettled.value);
    const seenReverts = new Set<string>();
    for (const row of (revertSettled.value.raw ?? []) as any[]) {
      const node = row.node;
      const id = domainId(node);
      if (!id || seenReverts.has(id)) continue;
      seenReverts.add(id);
      allNodeIds.add(id);
      const reverted = row.reverted;
      const revertedId = reverted ? domainId(reverted) : '';
      const nodeProps = node?.properties ?? node ?? {};
      reverts.push({
        id,
        title: nodeProps.title,
        revertedId: revertedId || undefined,
        files: Array.isArray(row.files) ? row.files.map(String) : [],
        number: nodeProps.number != null ? Number(nodeProps.number) : undefined,
        url: nodeProps.url ? String(nodeProps.url) : undefined,
      });
      sourceCollector.addPullRequest(id, nodeProps.id ? nodeProps : { ...nodeProps, id });
    }
  }

  // 6. Process PageRank risk ranking (algo.pageRank over component dependencies)
  const riskRanking: RiskRankItem[] = [];
  if (riskSettled.status === 'fulfilled') {
    ingestGraphPayload(riskSettled.value);
    for (const row of (riskSettled.value.raw ?? []) as any[]) {
      if (row?.component) {
        riskRanking.push({ component: String(row.component), score: Number(row.score ?? 0) });
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
      trace,
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
    reverts: reverts.slice(0, 10),
    riskRanking: riskRanking.slice(0, 5),
    codeOwners: codeOwners.slice(0, 10),
    sources: sourceCollector.sources,
    toolFindings: [],
    allNodeIds,
    cytoscapeElements: [
      ...Array.from(mergedNodesMap.values()),
      ...Array.from(mergedEdgesMap.values()),
    ],
  };

  return {
    status: 'SUCCESS',
    bundle: boundedBundle,
    trace,
  };
}

