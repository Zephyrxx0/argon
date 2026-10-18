import { Hono } from 'hono';
import {
  type ArgonGraphClient,
  FalkorUnavailableError,
  resolveScope,
  blastRadius,
  riskRanking,
  whoKnows,
  constrainingDecisions,
  precedentSearch,
  pathBetween,
  componentOverview,
  revertHistory,
  counterfactualImpact,
  ResolveScopeParamsSchema,
  BlastRadiusParamsSchema,
  RiskRankingParamsSchema,
  WhoKnowsParamsSchema,
  ConstrainingDecisionsParamsSchema,
  PrecedentSearchParamsSchema,
  PathBetweenParamsSchema,
  ComponentOverviewParamsSchema,
  RevertHistoryParamsSchema,
  CounterfactualImpactParamsSchema,
} from '@argon/graph';
import { type ZodSchema } from 'zod';
import { ErrorCodes, type GatewayErrorResponse } from '../types.js';

interface QueryDefinition {
  schema: ZodSchema;
  fn: (client: ArgonGraphClient, workspaceId: string, params: any) => Promise<any>;
}

const QUERY_MAP: Record<string, QueryDefinition> = {
  resolveScope: {
    schema: ResolveScopeParamsSchema,
    fn: resolveScope,
  },
  blastRadius: {
    schema: BlastRadiusParamsSchema,
    fn: blastRadius,
  },
  riskRanking: {
    schema: RiskRankingParamsSchema,
    fn: riskRanking,
  },
  whoKnows: {
    schema: WhoKnowsParamsSchema,
    fn: whoKnows,
  },
  constrainingDecisions: {
    schema: ConstrainingDecisionsParamsSchema,
    fn: constrainingDecisions,
  },
  precedentSearch: {
    schema: PrecedentSearchParamsSchema,
    fn: precedentSearch,
  },
  pathBetween: {
    schema: PathBetweenParamsSchema,
    fn: pathBetween,
  },
  componentOverview: {
    schema: ComponentOverviewParamsSchema,
    fn: componentOverview,
  },
  revertHistory: {
    schema: RevertHistoryParamsSchema,
    fn: revertHistory,
  },
  counterfactualImpact: {
    schema: CounterfactualImpactParamsSchema,
    fn: counterfactualImpact,
  },
};

const ALIAS_MAP: Record<string, string> = {
  resolve_scope: 'resolveScope',
  resolveScope: 'resolveScope',
  blast_radius: 'blastRadius',
  blastRadius: 'blastRadius',
  risk_ranking: 'riskRanking',
  riskRanking: 'riskRanking',
  who_knows: 'whoKnows',
  whoKnows: 'whoKnows',
  constraining_decisions: 'constrainingDecisions',
  constrainingDecisions: 'constrainingDecisions',
  precedent_search: 'precedentSearch',
  precedentSearch: 'precedentSearch',
  path_between: 'pathBetween',
  pathBetween: 'pathBetween',
  component_overview: 'componentOverview',
  componentOverview: 'componentOverview',
  revert_history: 'revertHistory',
  revertHistory: 'revertHistory',
  counterfactual_impact: 'counterfactualImpact',
  counterfactualImpact: 'counterfactualImpact',
};

export interface QueryRouteOptions {
  timeoutMs?: number;
}

export function queryRoute(graphClient: ArgonGraphClient, options?: QueryRouteOptions) {
  const router = new Hono();
  const timeoutMs = options?.timeoutMs ?? 5000;

  router.post('/:workspaceId/query/:queryName', async (c) => {
    const { workspaceId, queryName } = c.req.param();

    const canonicalName = ALIAS_MAP[queryName];
    if (!canonicalName || !QUERY_MAP[canonicalName]) {
      const errResponse: GatewayErrorResponse = {
        error: `Unknown query: ${queryName}`,
        code: ErrorCodes.UNKNOWN_QUERY,
      };
      return c.json(errResponse, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      const errResponse: GatewayErrorResponse = {
        error: 'Invalid JSON body',
        code: ErrorCodes.VALIDATION_ERROR,
      };
      return c.json(errResponse, 400);
    }

    const { schema, fn } = QUERY_MAP[canonicalName];
    const parseResult = schema.safeParse(body ?? {});
    if (!parseResult.success) {
      const errResponse: GatewayErrorResponse = {
        error: 'Validation Error',
        code: ErrorCodes.VALIDATION_ERROR,
        details: parseResult.error.issues,
      };
      return c.json(errResponse, 400);
    }

    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('QUERY_TIMEOUT'));
      }, timeoutMs);
    });

    try {
      const queryPromise = fn(graphClient, workspaceId, parseResult.data);
      const result = await Promise.race([queryPromise, timeoutPromise]);
      return c.json(result, 200);
    } catch (err: any) {
      if (err?.message === 'QUERY_TIMEOUT') {
        const errResponse: GatewayErrorResponse = {
          error: `FalkorDB query timed out after ${timeoutMs}ms`,
          code: ErrorCodes.FALKORDB_TIMEOUT,
        };
        return c.json(errResponse, 503);
      }

      if (
        err instanceof FalkorUnavailableError ||
        err?.message?.includes('FalkorDB is unavailable') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.code === 'ECONNREFUSED'
      ) {
        const errResponse: GatewayErrorResponse = {
          error: 'FalkorDB is unreachable',
          code: ErrorCodes.FALKORDB_UNREACHABLE,
        };
        return c.json(errResponse, 503);
      }

      const errResponse: GatewayErrorResponse = {
        error: err?.message ?? 'Internal server error',
        code: ErrorCodes.INTERNAL_ERROR,
      };
      return c.json(errResponse, 500);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  });

  return router;
}

