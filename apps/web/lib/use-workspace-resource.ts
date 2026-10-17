'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaceResource } from '@/lib/workspace-client';

export type ResourceState<T> =
  | { status: 'loading'; workspaceId: string }
  | { status: 'error'; workspaceId: string; message: string; code: number }
  | { status: 'ready'; workspaceId: string; data: T };

/**
 * Loads a workspace-scoped resource and returns state that is *tagged with the workspace it
 * belongs to*. When the workspace changes the hook immediately reports `loading` for the new
 * workspace (never the previous workspace's data), and late responses for an old workspace
 * are discarded.
 */
export function useWorkspaceResource<T>(
  workspaceId: string,
  resource: 'overview' | 'contributors',
  getToken: () => Promise<string | null>,
  enabled = true,
  /** Reload when the signed-in identity changes (guest session established, sign-in/out). */
  identityKey: string | null = null
): ResourceState<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading', workspaceId });
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    const controller = new AbortController();
    setState({ status: 'loading', workspaceId });

    (async () => {
      const token = await getTokenRef.current().catch(() => null);
      if (controller.signal.aborted) return;
      const result = await fetchWorkspaceResource<T>(workspaceId, resource, token, controller.signal);
      if (controller.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', workspaceId, data: result.data }
          : { status: 'error', workspaceId, message: result.message, code: result.status }
      );
    })();

    return () => controller.abort();
  }, [workspaceId, resource, enabled, identityKey]);

  // Even for the one render between a workspace change and the effect running, never expose
  // another workspace's data.
  return state.workspaceId === workspaceId ? state : { status: 'loading', workspaceId };
}
