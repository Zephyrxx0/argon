import type { PaletteSearchHit, PaletteSearchResult } from '@/lib/palette-search';

export type { PaletteSearchHit, PaletteSearchResult };

export interface PaletteSearchFn {
  (query: string, signal: AbortSignal): Promise<PaletteSearchHit[]>;
}

/**
 * Builds a client-side palette search function bound to a workspace. The page owns this
 * (it has the workspace id and auth token); the command dialog just calls it. Returns [] on
 * any failure so the dialog silently falls back to its local literal filter (fail-closed UX).
 */
export function createPaletteSearch(
  workspaceId: string,
  getToken: () => Promise<string | null>
): PaletteSearchFn {
  return async (query, signal) => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const url = `/api/palette/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { headers, signal });
      if (!res.ok) return [];
      const data = (await res.json()) as PaletteSearchResult;
      return Array.isArray(data.hits) ? data.hits : [];
    } catch {
      // AbortError (newer keystroke) or network/FalkorDB failure: let the local filter take over.
      return [];
    }
  };
}
