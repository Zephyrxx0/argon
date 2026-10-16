import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGatewayApp } from '../../src/app.js';
import { computeSignature } from '../../src/middleware/webhook-auth.js';
import { WebhookDeduplicator } from '../../src/services/webhook-dedup.js';
import { SyncOrchestrator } from '../../src/services/sync-orchestrator.js';

describe('Webhook Routes (Task 08-01-03, SYNC-01)', () => {
  const webhookSecret = 'test-wh-secret-xyz';
  let mockGraphClient: any;
  let deduplicator: WebhookDeduplicator;
  let orchestrator: SyncOrchestrator;

  beforeEach(() => {
    deduplicator = new WebhookDeduplicator();
    orchestrator = new SyncOrchestrator();

    mockGraphClient = {
      query: vi.fn().mockImplementation((...args: any[]) => {
        const cypher = typeof args[1] === 'string' ? args[1] : args[0];
        const params = typeof args[1] === 'string' ? args[2] : args[1];
        if (cypher.includes('MATCH (w:Workspace)')) {
          if (params?.repoFullName === 'org/tracked-repo' || params?.repoName === 'tracked-repo') {
            return Promise.resolve({ data: [{ id: 'tracked-repo-ws' }], rows: [{ id: 'tracked-repo-ws' }] });
          }
          return Promise.resolve({ data: [], rows: [] });
        }
        if (cypher.includes('MERGE (j:IngestJob')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
  });

  function makeApp() {
    return createGatewayApp({
      graphClient: mockGraphClient,
      gatewaySecret: 'gateway-jwt-secret-xyz',
      webhookSecret,
      webhooksOptions: {
        deduplicator,
        orchestrator,
        graphClient: mockGraphClient,
        webhookSecret,
      },
    });
  }

  it('rejects unsigned webhook request with 401 MISSING_SIGNATURE', async () => {
    const app = makeApp();
    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/main' }),
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
      },
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.code).toBe('MISSING_SIGNATURE');
  });

  it('rejects invalid HMAC signature with 401 INVALID_SIGNATURE', async () => {
    const app = makeApp();
    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/main' }),
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-Hub-Signature-256': 'sha256=1111111111111111111111111111111111111111111111111111111111111111',
      },
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.code).toBe('INVALID_SIGNATURE');
  });

  it('ignores pushes to non-default branch with 200 ignored: non_default_branch', async () => {
    const app = makeApp();
    const body = JSON.stringify({
      ref: 'refs/heads/feat/some-feature',
      repository: { name: 'tracked-repo', full_name: 'org/tracked-repo', default_branch: 'main' },
    });
    const sig = computeSignature(body, webhookSecret);

    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'deliv-1',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ignored).toBe(true);
    expect(data.reason).toBe('non_default_branch');
  });

  it('ignores pull_request when not closed or not merged with 200 ignored: pr_not_merged', async () => {
    const app = makeApp();
    const body = JSON.stringify({
      action: 'opened',
      pull_request: { merged: false },
      repository: { name: 'tracked-repo', full_name: 'org/tracked-repo', default_branch: 'main' },
    });
    const sig = computeSignature(body, webhookSecret);

    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'deliv-2',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ignored).toBe(true);
    expect(data.reason).toBe('pr_not_merged');
  });

  it('ignores unsupported events with 200 ignored: unsupported_event', async () => {
    const app = makeApp();
    const body = JSON.stringify({ action: 'created' });
    const sig = computeSignature(body, webhookSecret);

    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'star',
        'X-GitHub-Delivery': 'deliv-3',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ignored).toBe(true);
    expect(data.reason).toBe('unsupported_event');
  });

  it('ignores untracked repositories with 200 ignored: untracked_repository', async () => {
    const app = makeApp();
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { name: 'unknown-repo', full_name: 'org/unknown-repo', default_branch: 'main' },
    });
    const sig = computeSignature(body, webhookSecret);

    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'deliv-4',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ignored).toBe(true);
    expect(data.reason).toBe('untracked_repository');
  });

  it('accepts default branch push for tracked workspace, responds 202 and queues job', async () => {
    const app = makeApp();
    const dispatchSpy = vi.spyOn(orchestrator, 'dispatchSync');

    const body = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { name: 'tracked-repo', full_name: 'org/tracked-repo', default_branch: 'main' },
      commits: [
        { id: 'c1', message: 'feat: new feature', author: { name: 'Dev', email: 'dev@org.com' } },
      ],
    });
    const sig = computeSignature(body, webhookSecret);

    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'deliv-valid-1',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as any;
    expect(data.status).toBe('queued');
    expect(data.deliveryId).toBe('deliv-valid-1');
    expect(data.workspaceId).toBe('tracked-repo-ws');
    expect(typeof data.jobId).toBe('string');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('detects duplicate delivery GUID and returns 200 deduplicated: true without re-queueing', async () => {
    const app = makeApp();
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { name: 'tracked-repo', full_name: 'org/tracked-repo', default_branch: 'main' },
      commits: [{ id: 'c1' }],
    });
    const sig = computeSignature(body, webhookSecret);

    // First request
    const res1 = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'deliv-dup-1',
        'X-Hub-Signature-256': sig,
      },
    });
    expect(res1.status).toBe(202);

    // Second request with same delivery ID
    const res2 = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'deliv-dup-1',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as any;
    expect(data2.deduplicated).toBe(true);
  });

  it('accepts merged pull request for tracked workspace and queues job', async () => {
    const app = makeApp();
    const body = JSON.stringify({
      action: 'closed',
      pull_request: { merged: true, number: 42, merged_at: '2026-10-16T12:00:00Z' },
      repository: { name: 'tracked-repo', full_name: 'org/tracked-repo', default_branch: 'main' },
    });
    const sig = computeSignature(body, webhookSecret);

    const res = await app.request('/api/v1/webhooks/github', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'deliv-pr-1',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as any;
    expect(data.status).toBe('queued');
    expect(data.workspaceId).toBe('tracked-repo-ws');
  });
});
