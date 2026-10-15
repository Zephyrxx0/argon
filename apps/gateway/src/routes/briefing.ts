import { Hono } from 'hono';
import { z } from 'zod';
import type { ArgonGraphClient } from '@argon/graph';
import {
  DirectGraphGatewayClient,
  executeBriefingPipeline,
  type BriefingPipelineOptions,
} from '@argon/agent';
import { ErrorCodes, type GatewayErrorResponse } from '../types.js';

const BriefingRequestBodySchema = z.object({
  task: z.string().min(1, 'Task description cannot be empty'),
  files: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
  asOf: z.number().int().positive().optional(),
  contributorId: z.string().optional(),
  anonymousSessionId: z.string().optional(),
});

export interface BriefingRouteOptions {
  customGenerator?: (prompt: string) => Promise<unknown>;
  embedder?: any;
}

export function briefingRoute(
  graphClient: ArgonGraphClient,
  options?: BriefingRouteOptions
) {
  const router = new Hono();

  router.post('/:workspaceId/briefing', async (c) => {
    const { workspaceId } = c.req.param();

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

    const parseResult = BriefingRequestBodySchema.safeParse(body);
    if (!parseResult.success) {
      const errResponse: GatewayErrorResponse = {
        error: 'Validation Error',
        code: ErrorCodes.VALIDATION_ERROR,
        details: parseResult.error.issues,
      };
      return c.json(errResponse, 400);
    }

    const directClient = new DirectGraphGatewayClient(graphClient);

    const pipelineOptions: BriefingPipelineOptions = {
      client: directClient,
      graphClient,
      workspaceId,
      request: parseResult.data,
      customGenerator: options?.customGenerator,
      embedder: options?.embedder,
    };

    try {
      const response = await executeBriefingPipeline(pipelineOptions);
      return c.json(response, 200);
    } catch (err: any) {
      const errResponse: GatewayErrorResponse = {
        error: err?.message ?? 'Briefing pipeline execution failed',
        code: ErrorCodes.INTERNAL_ERROR,
      };
      return c.json(errResponse, 500);
    }
  });

  return router;
}
