import { Hono } from 'hono';
import type { ArgonGraphClient } from '@argon/graph';
import { webhookSignatureValidator } from '../middleware/webhook-auth.js';
import { webhookDeduplicator, type WebhookDeduplicator } from '../services/webhook-dedup.js';
import { syncOrchestrator, type SyncOrchestrator } from '../services/sync-orchestrator.js';

export interface WebhooksRouteOptions {
  graphClient?: ArgonGraphClient;
  webhookSecret?: string;
  orchestrator?: SyncOrchestrator;
  deduplicator?: WebhookDeduplicator;
}

export function webhooksRoute(options?: WebhooksRouteOptions): Hono {
  const router = new Hono();
  const dedup = options?.deduplicator ?? webhookDeduplicator;
  const orchestrator = options?.orchestrator ?? syncOrchestrator;
  const graphClient = options?.graphClient;

  router.use('/github', webhookSignatureValidator(options?.webhookSecret));

  router.post('/github', async (c) => {
    const event = c.req.header('X-GitHub-Event') || c.req.header('x-github-event') || '';
    const deliveryId = c.req.header('X-GitHub-Delivery') || c.req.header('x-github-delivery') || '';
    const payload = c.get('webhookPayload') || (await c.req.json().catch(() => ({})));

    // 1. Delivery Deduplication
    if (deliveryId && dedup.isDuplicate(deliveryId)) {
      return c.json({ status: 'ok', deduplicated: true }, 200);
    }

    // 2. Event and branch filtering
    if (event === 'push') {
      const ref = String(payload.ref || '');
      const defaultBranch = String(payload.repository?.default_branch || 'main');
      const isDefaultBranch =
        ref === `refs/heads/${defaultBranch}` ||
        (defaultBranch === 'main' && ref === 'refs/heads/master') ||
        (defaultBranch === 'master' && ref === 'refs/heads/main');

      if (!isDefaultBranch) {
        return c.json({ ignored: true, reason: 'non_default_branch' }, 200);
      }
    } else if (event === 'pull_request') {
      const isClosed = payload.action === 'closed';
      const isMerged = Boolean(payload.pull_request?.merged);

      if (!isClosed || !isMerged) {
        return c.json({ ignored: true, reason: 'pr_not_merged' }, 200);
      }
    } else {
      return c.json({ ignored: true, reason: 'unsupported_event' }, 200);
    }

    // 3. Workspace resolution
    const repoFullName = String(payload.repository?.full_name || '');
    const repoName = String(payload.repository?.name || '');
    let workspaceId = '';

    if (graphClient) {
      try {
        const result = await graphClient.query<{ id: string }>(
          `MATCH (w:Workspace)
           WHERE w.github_repo = $repoFullName OR w.id = $repoName OR w.name = $repoName
           RETURN w.id AS id
           LIMIT 1`,
          { repoFullName, repoName },
        );

        if (!result.rows || result.rows.length === 0) {
          return c.json({ ignored: true, reason: 'untracked_repository' }, 200);
        }

        workspaceId = result.rows[0].id;
      } catch (err) {
        console.error('Error resolving workspace for repository:', err);
        return c.json({ error: 'Failed to verify workspace', code: 'WORKSPACE_LOOKUP_ERROR' }, 500);
      }
    } else {
      workspaceId = repoName || 'default-workspace';
    }

    // 4. Async job dispatch & 202 Accepted response
    const jobId = await orchestrator.createIncrementalJob(
      graphClient,
      workspaceId,
      event,
      deliveryId,
    );

    orchestrator.dispatchSync(jobId, event, payload, workspaceId, graphClient);

    return c.json(
      {
        status: 'queued',
        deliveryId,
        jobId,
        workspaceId,
      },
      202,
    );
  });

  return router;
}
