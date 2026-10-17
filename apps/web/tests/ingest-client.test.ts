import { describe, it, expect, vi, afterEach } from 'vitest';
import { stepIndexForStatus, waitForIngest, IngestFailedError } from '@/lib/ingest-client';

const statusRes = (status: string, extra: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ workspaceId: 'ws', status, progress: 0, error: null, nodeCount: 0, ...extra }),
});

afterEach(() => vi.restoreAllMocks());

describe('ingest client', () => {
  it('maps job status onto the four visual steps', () => {
    expect(stepIndexForStatus('queued')).toBe(0);
    expect(stepIndexForStatus('cloning')).toBe(0);
    expect(stepIndexForStatus('mining')).toBe(1);
    expect(stepIndexForStatus('indexing')).toBe(2);
    expect(stepIndexForStatus('completed')).toBe(3);
  });

  it('polls until completed and reports progress along the way', async () => {
    const seq = [statusRes('cloning'), statusRes('mining'), statusRes('completed', { nodeCount: 9 })];
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(seq.shift()));
    const seen: string[] = [];
    const final = await waitForIngest('ws', {
      getToken: async () => 't',
      intervalMs: 1,
      onProgress: (s) => seen.push(s.status),
    });
    expect(seen).toEqual(['cloning', 'mining', 'completed']);
    expect(final.nodeCount).toBe(9);
  });

  it('rejects with the job error when the job fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(statusRes('failed', { error: 'clone failed' }));
    await expect(waitForIngest('ws', { getToken: async () => null, intervalMs: 1 })).rejects.toThrow('clone failed');
    await expect(waitForIngest('ws', { getToken: async () => null, intervalMs: 1 })).rejects.toBeInstanceOf(IngestFailedError);
  });

  it('tolerates transient polling errors but gives up after repeated ones', async () => {
    const flaky = [{ ok: false, status: 502, json: () => Promise.resolve({}) }, statusRes('completed')];
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(flaky.shift()));
    await expect(waitForIngest('ws', { getToken: async () => null, intervalMs: 1 })).resolves.toMatchObject({ status: 'completed' });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'down' }) });
    await expect(
      waitForIngest('ws', { getToken: async () => null, intervalMs: 1, maxPollErrors: 3 })
    ).rejects.toThrow('down');
    expect((global.fetch as any).mock.calls.length).toBe(3);
  });

  it('stops promptly when aborted', async () => {
    global.fetch = vi.fn().mockResolvedValue(statusRes('cloning'));
    const controller = new AbortController();
    const p = waitForIngest('ws', { getToken: async () => null, intervalMs: 50, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('times out', async () => {
    global.fetch = vi.fn().mockResolvedValue(statusRes('cloning'));
    await expect(
      waitForIngest('ws', { getToken: async () => null, intervalMs: 5, timeoutMs: 30 })
    ).rejects.toThrow(/timed out/i);
  });
});
