export interface SyncCompleteEvent {
  workspaceId: string;
  trigger: 'push' | 'pull_request';
  updated: {
    commits: string[];
    files: string[];
    decisions: string[];
  };
  superseded: string[];
}

export interface WorkspaceEventSourceOptions {
  baseUrl?: string;
  token?: string;
  onConnected?: () => void;
  onSyncComplete?: (data: SyncCompleteEvent) => void;
  onError?: (error: any) => void;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface WorkspaceEventSourceHandle {
  close: () => void;
}

/**
 * Creates an authenticated EventSource connection to the gateway SSE event stream
 * for the given workspace, with automatic exponential backoff reconnection.
 */
export function createWorkspaceEventSource(
  workspaceId: string,
  options?: WorkspaceEventSourceOptions
): WorkspaceEventSourceHandle {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return { close: () => {} };
  }

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimer: any = null;
  let currentBackoff = options?.initialBackoffMs ?? 1000;
  const maxBackoff = options?.maxBackoffMs ?? 15000;

  const connect = () => {
    if (isClosed) return;

    try {
      const base = options?.baseUrl ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? '';
      const token = options?.token;
      const queryParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const url = `${base}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/events${queryParam}`;

      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        currentBackoff = options?.initialBackoffMs ?? 1000;
        options?.onConnected?.();
      };

      eventSource.addEventListener('sync:complete', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data) as SyncCompleteEvent;
          options?.onSyncComplete?.(parsed);
        } catch (err) {
          console.error('[events-client] Failed to parse sync:complete JSON:', err);
        }
      });

      eventSource.onerror = (err) => {
        options?.onError?.(err);

        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        if (!isClosed) {
          reconnectTimer = setTimeout(() => {
            currentBackoff = Math.min(currentBackoff * 2, maxBackoff);
            connect();
          }, currentBackoff);
        }
      };
    } catch (err) {
      options?.onError?.(err);
    }
  };

  connect();

  return {
    close: () => {
      isClosed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    },
  };
}
