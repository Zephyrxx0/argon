export type EventListener = (event: string, data: any) => void;

/**
 * In-memory workspace-scoped event broadcaster for Server-Sent Events (SSE).
 * Enforces strict tenant isolation by only delivering events to clients
 * registered for that specific workspaceId.
 */
export class EventBroadcaster {
  private listeners = new Map<string, Set<EventListener>>();

  /**
   * Subscribes a listener to events for a specific workspace.
   * Returns an unsubscribe function for socket disconnect/abort cleanup.
   */
  public subscribe(workspaceId: string, listener: EventListener): () => void {
    if (!this.listeners.has(workspaceId)) {
      this.listeners.set(workspaceId, new Set());
    }
    const set = this.listeners.get(workspaceId)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(workspaceId);
      }
    };
  }

  /**
   * Broadcasts an event and JSON payload to all active listeners in the given workspace.
   */
  public broadcast(workspaceId: string, event: string, data: any): void {
    const set = this.listeners.get(workspaceId);
    if (!set || set.size === 0) {
      return;
    }

    for (const listener of set) {
      try {
        listener(event, data);
      } catch (err) {
        console.error(`[EventBroadcaster] Listener error for workspace ${workspaceId}:`, err);
      }
    }
  }

  /**
   * Returns the count of active listeners, optionally scoped to a workspace.
   */
  public listenerCount(workspaceId?: string): number {
    if (workspaceId) {
      return this.listeners.get(workspaceId)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Clears all registered listeners across all workspaces.
   */
  public clear(): void {
    this.listeners.clear();
  }
}

export const eventBroadcaster = new EventBroadcaster();
