import {
  type ArgonGraphClient,
  type DualPayload,
  resolveScope,
  blastRadius,
  riskRanking,
  whoKnows,
  constrainingDecisions,
  precedentSearch,
  pathBetween,
  componentOverview,
  revertHistory,
} from '@argon/graph';
import {
  type GatewayClient,
  type QueryName,
  type QueryParamsMap,
  type QueryResultMap,
  type BriefingRequest,
  type BriefingResponse,
  GatewayError,
} from './types.js';

export class DirectGraphGatewayClient implements GatewayClient {
  constructor(
    private readonly client: ArgonGraphClient,
    private readonly briefingHandler?: (
      workspaceId: string,
      request: BriefingRequest
    ) => Promise<BriefingResponse>
  ) {}

  async executeQuery<K extends QueryName>(
    workspaceId: string,
    queryName: K,
    params: QueryParamsMap[K]
  ): Promise<DualPayload<QueryResultMap[K]>> {
    switch (queryName) {
      case 'resolveScope':
        return (await resolveScope(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'blastRadius':
        return (await blastRadius(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'riskRanking':
        return (await riskRanking(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'whoKnows':
        return (await whoKnows(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'constrainingDecisions':
        return (await constrainingDecisions(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'precedentSearch':
        return (await precedentSearch(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'pathBetween':
        return (await pathBetween(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'componentOverview':
        return (await componentOverview(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      case 'revertHistory':
        return (await revertHistory(
          this.client,
          workspaceId,
          params as any
        )) as DualPayload<QueryResultMap[K]>;
      default:
        throw new GatewayError(`Unknown query name: ${queryName}`, 'UNKNOWN_QUERY', 400);
    }
  }

  async generateBriefing(
    workspaceId: string,
    request: BriefingRequest
  ): Promise<BriefingResponse> {
    if (!this.briefingHandler) {
      throw new GatewayError(
        'DirectGraphGatewayClient initialized without briefingHandler',
        'NOT_IMPLEMENTED',
        501
      );
    }
    return this.briefingHandler(workspaceId, request);
  }

  async healthCheck(): Promise<{ ok: boolean; [key: string]: unknown }> {
    try {
      const ok = await this.client.ping();
      return { ok, falkor: ok ? 'healthy' : 'unreachable' };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  }
}

