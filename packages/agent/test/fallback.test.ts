import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { generateStructuredWithFallback } from '../src/briefing/llm.js';

describe('LLM Rate-Limit Fallback & Retries', () => {
  const dummySchema = z.object({
    result: z.string(),
  });

  const rateLimitError = new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded');
  (rateLimitError as any).status = 429;

  it('retries on HTTP 429 and succeeds on first retry', async () => {
    const callerMock = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ result: 'success-retry-1' });

    const result = await generateStructuredWithFallback('test prompt', dummySchema, {
      caller: callerMock,
      retryDelays: [10, 20], // Fast delays for test
    });

    expect(result).toEqual({ result: 'success-retry-1' });
    expect(callerMock).toHaveBeenCalledTimes(2);
    expect(callerMock).toHaveBeenNthCalledWith(
      1,
      'gemma-4-31b-it',
      'test prompt',
      dummySchema
    );
    expect(callerMock).toHaveBeenNthCalledWith(
      2,
      'gemma-4-31b-it',
      'test prompt',
      dummySchema
    );
  });

  it('retries twice on HTTP 429 and succeeds on second retry', async () => {
    const callerMock = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ result: 'success-retry-2' });

    const result = await generateStructuredWithFallback('test prompt', dummySchema, {
      caller: callerMock,
      retryDelays: [10, 20],
    });

    expect(result).toEqual({ result: 'success-retry-2' });
    expect(callerMock).toHaveBeenCalledTimes(3);
  });

  it('exhausts 2 retries on HTTP 429 and automatically falls back to gemini-2.5-flash-lite', async () => {
    const callerMock = vi.fn().mockImplementation((modelName) => {
      if (modelName === 'gemma-4-31b-it') {
        return Promise.reject(rateLimitError);
      }
      if (modelName === 'gemini-2.5-flash-lite') {
        return Promise.resolve({ result: 'fallback-success' });
      }
      return Promise.reject(new Error('Unknown model'));
    });

    const result = await generateStructuredWithFallback('test prompt', dummySchema, {
      caller: callerMock,
      retryDelays: [10, 20],
    });

    expect(result).toEqual({ result: 'fallback-success' });
    // 1 initial + 2 retries with primary, then 1 call with fallback = 4 calls total
    expect(callerMock).toHaveBeenCalledTimes(4);
    expect(callerMock).toHaveBeenLastCalledWith(
      'gemini-2.5-flash-lite',
      'test prompt',
      dummySchema
    );
  });

  it('fails immediately without retrying when non-429 error occurs (e.g. 401 Unauthorized)', async () => {
    const authError = new Error('401 Invalid API Key');
    (authError as any).status = 401;

    const callerMock = vi.fn().mockRejectedValue(authError);

    await expect(
      generateStructuredWithFallback('test prompt', dummySchema, {
        caller: callerMock,
        retryDelays: [10, 20],
      })
    ).rejects.toThrow('401 Invalid API Key');

    expect(callerMock).toHaveBeenCalledTimes(1);
  });
});

