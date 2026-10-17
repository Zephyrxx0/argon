import { describe, it, expect, vi } from 'vitest';
import { FalkorIngestWriter } from '../src/writer/falkordb.js';
import type { ArgonGraphClient } from '@argon/graph';

describe('FalkorIngestWriter undefined handling', () => {
  it('drops undefined fields (e.g. a missing embedding) instead of letting the client throw', async () => {
    const query = vi.fn().mockResolvedValue({ data: [] });
    const writer = new FalkorIngestWriter({ query } as unknown as ArgonGraphClient, 'ws');

    await writer.writeDecisions([
      {
        id: 'd1',
        title: 't',
        status: 'accepted',
        valid_from: 1,
        valid_to: null,
        source_url: 'u',
        source_kind: 'adr',
        summary: 's',
        embedding: undefined,
      },
    ]);

    const batch = query.mock.calls[0]![2].batch as Array<Record<string, unknown>>;
    expect(batch[0]).not.toHaveProperty('embedding');
    expect(batch[0]!.valid_to).toBeNull(); // null is preserved
    expect(Object.values(batch[0]!).every((v) => v !== undefined)).toBe(true);
  });
});
