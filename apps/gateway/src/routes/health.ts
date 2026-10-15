import { Hono } from 'hono';
import type { ArgonGraphClient } from '@argon/graph';
import type { GatewayHealthResponse } from '../types.js';

export function healthRoute(graphClient?: ArgonGraphClient) {
  const router = new Hono();
  const startTime = Date.now();

  router.get('/', async (c) => {
    let falkorStatus: 'healthy' | 'unreachable' = 'unreachable';

    if (graphClient) {
      try {
        const isHealthy = await graphClient.ping();
        if (isHealthy) {
          falkorStatus = 'healthy';
        }
      } catch {
        falkorStatus = 'unreachable';
      }
    }

    const response: GatewayHealthResponse = {
      status: 'ok',
      falkor: falkorStatus,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: Date.now(),
    };

    return c.json(response, 200);
  });

  return router;
}

