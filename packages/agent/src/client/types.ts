import type {
  DualPayload,
  ResolveScopeParams,
  ResolveScopeResult,
  BlastRadiusParams,
  BlastRadiusResult,
  RiskRankingParams,
  RiskRankingResult,
  WhoKnowsParams,
  WhoKnowsResult,
  ConstrainingDecisionsParams,
  ConstrainingDecisionsResult,
  PrecedentSearchParams,
  PrecedentSearchResult,
  PathBetweenParams,
  PathBetweenResult,
  ComponentOverviewParams,
  ComponentOverviewResult,
  RevertHistoryParams,
  RevertHistoryResult,
  CounterfactualImpactParams,
  CounterfactualImpactResult,
} from '@argon/graph';

import type { ToolTraceEntry } from '../tools/trace.js';
import type { Verdict } from '../verdict/verdict.js';
import type { CodeOwnerItem, EvidenceSource } from '../briefing/types.js';
import type { FreshnessSummary } from '../briefing/freshness.js';
import type { LearningPath } from '../briefing/learning-path.js';

export type QueryName =
  | 'resolveScope'
  | 'blastRadius'
  | 'riskRanking'
  | 'whoKnows'
  | 'constrainingDecisions'
  | 'precedentSearch'
  | 'pathBetween'
  | 'componentOverview'
  | 'revertHistory'
  | 'counterfactualImpact';

export interface QueryParamsMap {
  resolveScope: ResolveScopeParams;
  blastRadius: BlastRadiusParams;
  riskRanking: RiskRankingParams;
  whoKnows: WhoKnowsParams;
  constrainingDecisions: ConstrainingDecisionsParams;
  precedentSearch: PrecedentSearchParams;
  pathBetween: PathBetweenParams;
  componentOverview: ComponentOverviewParams;
  revertHistory: RevertHistoryParams;
  counterfactualImpact: CounterfactualImpactParams;
}

export interface QueryResultMap {
  resolveScope: ResolveScopeResult;
  blastRadius: BlastRadiusResult;
  riskRanking: RiskRankingResult;
  whoKnows: WhoKnowsResult;
  constrainingDecisions: ConstrainingDecisionsResult;
  precedentSearch: PrecedentSearchResult;
  pathBetween: PathBetweenResult;
  componentOverview: ComponentOverviewResult;
  revertHistory: RevertHistoryResult;
  counterfactualImpact: CounterfactualImpactResult;
}

export interface BriefingRequest {
  task: string;
  files?: string[];
  components?: string[];
  asOf?: number;
  contributorId?: string;
  anonymousSessionId?: string;
}

export interface ToolSelectionSummary {
  /** `skipped` = the fixed pipeline ran alone (no model configured or disabled). */
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
  steps: number;
  /** Number of extra tool calls the LLM planner made. */
  llmCallCount: number;
}

export interface BriefingResponse {
  status: 'SUCCESS' | 'NO_GRAPH_DATA' | 'CITATION_INTEGRITY_FAILURE' | 'ERROR';
  briefingId?: string;
  briefing?: unknown;
  evidence?: unknown;
  reason?: string;
  /** Deterministic, graph-derived PROCEED / REVIEW / HOLD verdict (SUCCESS only). */
  verdict?: Verdict;
  /** Every graph tool call behind this answer, in order. */
  toolTrace?: ToolTraceEntry[];
  toolSelection?: ToolSelectionSummary;
  /**
   * Clickable provenance for the cited nodes (commit / ADR / pull request / issue links), taken
   * from graph properties only (SUCCESS only).
   */
  sources?: EvidenceSource[];
  /** CODEOWNERS owners of record for the components in scope (SUCCESS only). */
  codeOwners?: CodeOwnerItem[];
  /** How old the cited decisions are (SUCCESS only); never produced by the model. */
  freshness?: FreshnessSummary;
  /** Shortest dependency walks the planner asked for, annotated with decisions and owners. */
  learningPaths?: LearningPath[];
}

export interface GatewayClient {
  executeQuery<K extends QueryName>(
    workspaceId: string,
    queryName: K,
    params: QueryParamsMap[K]
  ): Promise<DualPayload<QueryResultMap[K]>>;
  generateBriefing(
    workspaceId: string,
    request: BriefingRequest
  ): Promise<BriefingResponse>;
  healthCheck(): Promise<{ ok: boolean; [key: string]: unknown }>;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class GatewayAuthError extends GatewayError {
  constructor(message: string = 'Authentication failed', details?: unknown) {
    super(message, 'UNAUTHORIZED', 401, details);
    this.name = 'GatewayAuthError';
  }
}

export class GatewayTimeoutError extends GatewayError {
  constructor(message: string = 'Gateway query timed out', details?: unknown) {
    super(message, 'FALKORDB_TIMEOUT', 503, details);
    this.name = 'GatewayTimeoutError';
  }
}

export class GatewayUnreachableError extends GatewayError {
  constructor(message: string = 'Gateway or FalkorDB is unreachable', details?: unknown) {
    super(message, 'FALKORDB_UNREACHABLE', 503, details);
    this.name = 'GatewayUnreachableError';
  }
}

