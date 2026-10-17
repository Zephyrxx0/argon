import { describe, it, expect, vi } from 'vitest';
import { embedDecisionsBestEffort } from '../src/mining/embed.js';
import type { MinedDecision } from '../src/mining/types.js';

const decisions = [{ id: 'd1', title: 't', summary: 's' }] as unknown as MinedDecision[];

describe('embedDecisionsBestEffort', () => {
  it('reports success when embedding works', async () => {
    const embed = vi.fn().mockResolvedValue(decisions);
    expect(await embedDecisionsBestEffort(decisions, embed)).toEqual({ embedded: true });
    expect(embed).toHaveBeenCalledWith(decisions);
  });

  it('swallows embedding failures so ingestion can still complete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const embed = vi.fn().mockRejectedValue(new Error('Unable to get model file path or buffer.'));
    await expect(embedDecisionsBestEffort(decisions, embed)).resolves.toEqual({
      embedded: false,
      error: 'Unable to get model file path or buffer.',
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
