import { describe, it, expect, vi, afterEach } from 'vitest';
import { startJobHeartbeat } from '../src/pipeline.js';
import { FalkorIngestWriter } from '../src/writer/falkordb.js';
import { TOUCH_JOB } from '../src/writer/queries.js';
import type { ArgonGraphClient } from '@argon/graph';

afterEach(() => vi.useRealTimers());

describe('ingest job heartbeat', () => {
  it('touches the job on every interval and stops when asked', () => {
    vi.useFakeTimers();
    const touchJob = vi.fn().mockResolvedValue(undefined);
    const stop = startJobHeartbeat({ touchJob }, 'job_1', 1000);

    vi.advanceTimersByTime(3500);
    expect(touchJob).toHaveBeenCalledTimes(3);
    expect(touchJob).toHaveBeenCalledWith('job_1');

    stop();
    vi.advanceTimersByTime(5000);
    expect(touchJob).toHaveBeenCalledTimes(3);
  });

  it('ignores heartbeat write failures', async () => {
    vi.useFakeTimers();
    const touchJob = vi.fn().mockRejectedValue(new Error('db down'));
    const stop = startJobHeartbeat({ touchJob }, 'job_1', 1000);
    expect(() => vi.advanceTimersByTime(2500)).not.toThrow();
    await Promise.resolve();
    stop();
  });

  it('writes a guarded update that cannot revive finished jobs', async () => {
    const query = vi.fn().mockResolvedValue({ data: [] });
    const writer = new FalkorIngestWriter({ query } as unknown as ArgonGraphClient, 'ws');
    await writer.touchJob('job_9');

    const [ws, cypher, params] = query.mock.calls[0]!;
    expect(ws).toBe('ws');
    expect(cypher).toBe(TOUCH_JOB);
    expect(cypher).toContain("j.status <> 'completed'");
    expect(cypher).toContain("j.status <> 'failed'");
    expect(params.jobId).toBe('job_9');
    expect(typeof params.updatedAt).toBe('number');
  });
});
