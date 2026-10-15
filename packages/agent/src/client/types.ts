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
} from '@argon/graph';

export type QueryName =
  | 'resolveScope'
  | 'blastRadius'
  | 'riskRanking'
  | 'whoKnows'
  | 'constrainingDecisions'
  | 'precedentSearch'
  | 'pathBetween'
  | 'componentOverview';

export interface QueryParamsMap {
  resolveScope: ResolveScopeParams;
  blastRadius: BlastRadiusParams;
  riskRanking: RiskRankingParams;
  whoKnows: WhoKnowsParams;
  constrainingDecisions: ConstrainingDecisionsParams;
  precedentSearch: PrecedentSearchParams;
  pathBetween: PathBetweenParams;
  componentOverview: ComponentOverviewParams;
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
}

export interface BriefingRequest {
  task: string;
  files?: string[];
  components?: string[];
  asOf?: number;
  contributorId?: string;
  anonymousSessionId?: string;
}

export interface BriefingResponse {
  status: 'SUCCESS' | 'NO_GRAPH_DATA' | 'CITATION_INTEGRITY_FAILURE' | 'ERROR';
  briefingId?: string;
  briefing?: unknown;
  evidence?: unknown;
  reason?: string;
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

