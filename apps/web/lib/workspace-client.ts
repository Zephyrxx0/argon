export type WorkspaceFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * Typed GET against a workspace-scoped API route. Never throws: network/graph
 * failures are folded into `{ ok: false }` so panels can render a fail-closed state.
 */
export async function fetchWorkspaceResource<T>(
  workspaceId: string,
  resource: 'files' | 'supersessions' | 'overview' | 'contributors',
  token: string | null,
  signal?: AbortSignal
): Promise<WorkspaceFetchResult<T>> {
  try {
    const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/${resource}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: body.reason || body.message || body.error || `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, status: 0, message: 'aborted' };
    }
    return {
      ok: false,
      status: 503,
      message: 'FalkorDB Graph Unreachable (503): No graph, no answer.',
    };
  }
}
