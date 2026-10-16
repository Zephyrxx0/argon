export class WebhookDeduplicator {
  private cache = new Map<string, number>();
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Checks whether a delivery ID has already been processed.
   * If not seen, records it with the current timestamp and returns false.
   * If seen, returns true.
   */
  public isDuplicate(deliveryId: string): boolean {
    if (!deliveryId || typeof deliveryId !== 'string') {
      return false;
    }

    if (this.cache.has(deliveryId)) {
      return true;
    }

    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(deliveryId, Date.now());
    return false;
  }

  /**
   * Evicts the oldest entry from the cache (first key in map iteration).
   */
  public evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }

  public get size(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const webhookDeduplicator = new WebhookDeduplicator();
