import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventBroadcaster, eventBroadcaster } from '../services/event-broadcaster.js';

export interface EventsRouteOptions {
  broadcaster?: EventBroadcaster;
  heartbeatIntervalMs?: number;
}

/**
 * Creates the Server-Sent Events (SSE) router for live graph sync streaming.
 * Clients subscribe to a specific workspace and receive incremental delta notifications.
 */
export function eventsRoute(options?: EventsRouteOptions): Hono {
  const router = new Hono();
  const broadcaster = options?.broadcaster ?? eventBroadcaster;
  const heartbeatMs = options?.heartbeatIntervalMs ?? 15_000;

  const handleEvents = async (c: any) => {
    const workspaceId = c.req.param('workspaceId');
    if (!workspaceId) {
      return c.json({ error: 'Missing workspaceId parameter', code: 'VALIDATION_ERROR' }, 400);
    }

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('X-Accel-Buffering', 'no');

    return streamSSE(c, async (stream) => {
      let interval: NodeJS.Timeout | null = null;
      let unsubscribe: (() => void) | null = null;

      const abortPromise = new Promise<void>((resolve) => {
        stream.onAbort(() => {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          resolve();
        });
      });

      // Initial connection greeting
      await stream.write(': connected\n\n');

      // Subscribe to broadcaster for this workspace
      unsubscribe = broadcaster.subscribe(workspaceId, (event, data) => {
        stream
          .writeSSE({
            event,
            data: typeof data === 'string' ? data : JSON.stringify(data),
          })
          .catch(() => {});
      });

      // Periodic heartbeat keepalive
      interval = setInterval(() => {
        stream.write(': heartbeat\n\n').catch(() => {});
      }, heartbeatMs);

      await abortPromise;
    });
  };

  router.get('/:workspaceId/events', handleEvents);
  router.get('/workspaces/:workspaceId/events', handleEvents);

  return router;
}
