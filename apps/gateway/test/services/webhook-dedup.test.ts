import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookDeduplicator } from '../../src/services/webhook-dedup.js';

describe('Webhook Delivery Deduplicator (Task 08-01-02, SYNC-01)', () => {
  let dedup: WebhookDeduplicator;

  beforeEach(() => {
    dedup = new WebhookDeduplicator(5);
  });

  it('returns false on first delivery check and true on duplicate', () => {
    const id = 'delivery-uuid-1';
    expect(dedup.isDuplicate(id)).toBe(false);
    expect(dedup.isDuplicate(id)).toBe(true);
    expect(dedup.size).toBe(1);
  });

  it('handles multiple distinct delivery IDs', () => {
    expect(dedup.isDuplicate('d-1')).toBe(false);
    expect(dedup.isDuplicate('d-2')).toBe(false);
    expect(dedup.isDuplicate('d-3')).toBe(false);
    expect(dedup.size).toBe(3);

    expect(dedup.isDuplicate('d-1')).toBe(true);
    expect(dedup.isDuplicate('d-2')).toBe(true);
    expect(dedup.isDuplicate('d-4')).toBe(false);
  });

  it('evicts oldest entries when capacity is exceeded', () => {
    for (let i = 1; i <= 5; i++) {
      expect(dedup.isDuplicate(`delivery-${i}`)).toBe(false);
    }
    expect(dedup.size).toBe(5);

    // Adding 6th should evict delivery-1
    expect(dedup.isDuplicate('delivery-6')).toBe(false);
    expect(dedup.size).toBe(5);

    // delivery-1 is now evicted, so checking it again returns false (treated as new)
    expect(dedup.isDuplicate('delivery-1')).toBe(false);
    // and delivery-2 was next in line
  });

  it('handles empty or invalid delivery IDs gracefully', () => {
    expect(dedup.isDuplicate('')).toBe(false);
    expect(dedup.isDuplicate(null as unknown as string)).toBe(false);
  });

  it('clear() empties cache', () => {
    dedup.isDuplicate('id-1');
    dedup.isDuplicate('id-2');
    expect(dedup.size).toBe(2);
    dedup.clear();
    expect(dedup.size).toBe(0);
  });
});
