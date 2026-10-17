import { ArgonEmbedder, type ArgonGraphClient } from '@argon/graph';
import type {
  GatewayClient,
  BriefingRequest,
  BriefingResponse,
  ToolSelectionSummary,
} from '../client/types.js';
import { resolveBriefingScope } from './resolver.js';
import { dispatchRetrievalBundle } from './dispatcher.js';
import { narrateBriefing } from './narrator.js';
import { generateJsonWithFallback, hasLlmApiKey } from './llm.js';
import type { EvidenceBundle, ResolvedScope, ToolFinding } from './types.js';
import { validateCitationIntegrity } from '../citations/validator.js';
import { recordOutcome } from '../memory/record-outcome.js';
import { computeVerdict } from '../verdict/verdict.js';
import {
  createToolboxInvoker,
  runToolSelection,
  type PlannerGenerator,
  type ToolInvoker,
} from '../tools/planner.js';
import type { ToolTraceEntry } from '../tools/trace.js';

export interface ToolSelectionConfig {
  /** Model call returning the planner's JSON step. Defaults to Gemma with a Gemini fallback. */
  generator?: PlannerGenerator;
  /** Where tool calls run. Defaults to in-process; pass an MCP-backed invoker to go through MCP. */
  invoker?: ToolInvoker;
  maxSteps?: number;
  maxCalls?: number;
  timeoutMs?: number;
}

export interface BriefingPipelineOptions {
  client: GatewayClient;
  graphClient?: ArgonGraphClient;
  embedder?: ArgonEmbedder;
  workspaceId: string;
  request: BriefingRequest;
  customGenerator?: (prompt: string) => Promise<unknown>;
  /**
   * LLM tool selection (the planner picks extra graph tools on top of the fixed retrieval).
   * - `false`: off.
   * - object: on, with the given generator/invoker/budgets.
   * - omitted: on only when a model API key is configured, ARGON_TOOL_SELECTION is not "off",
   *   and no `customGenerator` was injected (injected generators mean "no live model").
   */
  toolSelection?: false | ToolSelectionConfig;
}

function buildCoreSummary(scope: ResolvedScope, bundle: EvidenceBundle): string {
  const lines: string[] = [];
  lines.push(
    `- touched files (${bundle.touchedFiles.length}): ${bundle.touchedFiles
      .slice(0, 6)
      .map((f) => `${f.path}${f.component ? ` [${f.component}]` : ''}`)
      .join(', ') || 'none'}`
  );
  lines.push(
    `- downstream components (${bundle.blastComponents.length}): ${bundle.blastComponents
      .map((b) => b.component)
      .join(', ') || 'none'}`
  );
  lines.push(
    `- decisions in force (${bundle.constrainingDecisions.length}): ${bundle.constrainingDecisions
      .map((d) => d.decisionId)
      .join(', ') || 'none'}`
  );
  lines.push(
    `- precedents (${bundle.precedents.length}): ${bundle.precedents
      .map((p) => `${p.decisionId}${p.status ? `(${p.status})` : ''}`)
      .join(', ') || 'none'}`
  );
  lines.push(
    `- key owners: ${bundle.keyOwners.map((o) => o.name).join(', ') || 'none'}`
  );
  lines.push(`- revert commits on these files: ${bundle.reverts.length}`);
  lines.push(
    `- PageRank top components: ${bundle.riskRanking
      .map((r) => `${r.component} (${r.score.toFixed(3)})`)
      .join(', ') || 'none'}`
  );
  void scope;
  return lines.join('\n');
}

function toFinding(trace: ToolTraceEntry, out: { rowCount: number; rows: unknown[]; evidence: { primaryIds: string[] } }): ToolFinding {
  return {
    tool: trace.tool,
    args: trace.args,
    rowCount: out.rowCount,
    primaryIds: out.evidence.primaryIds.slice(0, 25),
    preview: JSON.stringify(out.rows.slice(0, 5)).slice(0, 700),
  };
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

  // 2. Dispatch Retrieval Bundle (D-06, D-08): fixed, traced graph queries
  const retrievalResult = await dispatchRetrievalBundle(
    client,
    workspaceId,
    resolvedScope
  );
  const toolTrace: ToolTraceEntry[] = [...(retrievalResult.trace ?? [])];

  // 3. Short-circuit on NO_GRAPH_DATA (D-12)
  if (retrievalResult.status === 'NO_GRAPH_DATA' || !retrievalResult.bundle) {
    return {
      status: 'NO_GRAPH_DATA',
      reason: retrievalResult.reason ?? 'No matching graph entities found for the requested scope.',
      briefing: null,
      evidence: { nodeCount: 0, verifiedCitationCount: 0 },
      toolTrace,
    };
  }

  const bundle = retrievalResult.bundle;

  // 3b. LLM tool selection: the model may pull in more graph tools (PageRank, shortest
  //     path, component overview, ...). Best effort: any failure leaves the fixed
  //     retrieval untouched, so the briefing is never worse than without it.
  const selection = options.toolSelection;
  let toolSelection: ToolSelectionSummary;
  const disabledReason =
    selection === false
      ? 'disabled by caller'
      : selection === undefined && options.customGenerator
        ? 'custom narration generator injected (no live model)'
        : selection === undefined && process.env.ARGON_TOOL_SELECTION === 'off'
          ? 'disabled by ARGON_TOOL_SELECTION=off'
          : selection === undefined && !hasLlmApiKey()
            ? 'no model API key configured'
            : undefined;

  if (disabledReason) {
    toolSelection = { status: 'skipped', reason: disabledReason, steps: 0, llmCallCount: 0 };
  } else {
    const config: ToolSelectionConfig = selection || {};
    const invoker =
      config.invoker ??
      createToolboxInvoker({ client, embedder }, workspaceId);
    const generator: PlannerGenerator =
      config.generator ??
      // The planner emits a few lines of JSON: use the fast model first (Gemma is slow for this),
      // and keep Gemma as the fallback.
      ((prompt) =>
        generateJsonWithFallback(prompt, {
          primaryModel: 'gemini-2.5-flash-lite',
          fallbackModel: 'gemma-4-31b-it',
        }));
    try {
      const result = await runToolSelection({
        task: request.task,
        scope: { files: resolvedScope.files, components: resolvedScope.components },
        coreSummary: buildCoreSummary(resolvedScope, bundle),
        alreadyRan: toolTrace,
        invoker,
        generator,
        maxSteps: config.maxSteps,
        maxCalls: config.maxCalls,
        timeoutMs: config.timeoutMs,
      });
      toolTrace.push(...result.trace);
      // Fold what the planner found into the evidence the narrator may cite.
      for (const { entry, output } of result.outputs) {
        bundle.toolFindings.push(toFinding(entry, output));
        for (const id of output.evidence.primaryIds) bundle.allNodeIds.add(id);
      }
      toolSelection = {
        status: result.status,
        reason: result.reason,
        steps: result.steps,
        llmCallCount: result.trace.filter((t) => t.status === 'ok').length,
      };
    } catch (err: any) {
      toolSelection = {
        status: 'failed',
        reason: `Tool selection crashed: ${err?.message ?? err}`,
        steps: 0,
        llmCallCount: 0,
      };
    }
  }

  // 3c. Graph-driven verdict (deterministic; independent of the LLM)
  const verdict = computeVerdict(bundle);

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
      toolTrace,
      toolSelection,
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
        verdict: verdict.level,
        toolCallCount: toolTrace.filter((t) => t.status === 'ok').length,
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
    verdict,
    toolTrace,
    toolSelection,
    sources: bundle.sources ?? [],
    codeOwners: bundle.codeOwners ?? [],
  };
}

export const runBriefingPipeline = executeBriefingPipeline;
