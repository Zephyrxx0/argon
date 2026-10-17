'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  createWorkspaceEventSource,
  type SyncCompleteEvent,
  type WorkspaceEventSourceHandle,
} from './events-client';

export interface FocusRequest {
  nodeId: string;
  timestamp: number;
}

export interface GraphSyncState {
  // Interactive canvas selection & focus
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  highlightedIds: string[];
  focusRequest: FocusRequest | null;
  setHoveredNode: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  focusNode: (id: string) => void;
  clearSelection: () => void;
  setHighlightedIds: (ids: string[]) => void;

  // Real-time incremental sync state (Wave 3 - SYNC-03)
  lastSyncEvent: SyncCompleteEvent | null;
  isSyncing: boolean;
  syncBadgeText: string | null;
  clearSyncBadge: () => void;
  subscribeSync: (callback: (event: SyncCompleteEvent) => void) => () => void;
}

export interface GraphSyncProviderProps {
  children: React.ReactNode;
  workspaceId?: string;
  token?: string;
}

export function formatSyncBadgeText(event: SyncCompleteEvent): string {
  const commitCount = event.updated.commits.length;
  const adrSupersededCount = event.superseded.length;
  const adrNewCount = event.updated.decisions.length;

  const parts: string[] = [];
  if (commitCount > 0) {
    parts.push(`+${commitCount} commit${commitCount === 1 ? '' : 's'}`);
  }
  if (adrSupersededCount > 0) {
    parts.push(`${adrSupersededCount} ADR superseded`);
  } else if (adrNewCount > 0) {
    parts.push(`+${adrNewCount} ADR`);
  }

  if (parts.length === 0) {
    return 'LIVE SYNC • graph updated';
  }

  return `LIVE SYNC • ${parts.join(', ')}`;
}

const GraphSyncContext = createContext<GraphSyncState | null>(null);

export function GraphSyncProvider({ children, workspaceId, token }: GraphSyncProviderProps) {
  // Canvas hover/selection/focus state
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIdsState] = useState<string[]>([]);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  // Real-time sync state
  const [lastSyncEvent, setLastSyncEvent] = useState<SyncCompleteEvent | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncBadgeText, setSyncBadgeText] = useState<string | null>(null);

  const listenersRef = useRef<Set<(event: SyncCompleteEvent) => void>>(new Set());
  const timerRef = useRef<any>(null);

  const setHoveredNode = useCallback((id: string | null) => {
    setHoveredNodeId(id);
  }, []);

  const setSelectedNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const focusNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setFocusRequest({ nodeId: id, timestamp: Date.now() });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setHoveredNodeId(null);
    setHighlightedIdsState([]);
    setFocusRequest(null);
  }, []);

  const setHighlightedIds = useCallback((ids: string[]) => {
    setHighlightedIdsState(ids);
  }, []);

  const subscribeSync = useCallback((callback: (event: SyncCompleteEvent) => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  const clearSyncBadge = useCallback(() => {
    setSyncBadgeText(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Selection / hover / focus / sync badges belong to one workspace's graph
  useEffect(() => {
    setHoveredNodeId(null);
    setSelectedNodeId(null);
    setHighlightedIdsState([]);
    setFocusRequest(null);
    setLastSyncEvent(null);
    setIsSyncing(false);
    setSyncBadgeText(null);
  }, [workspaceId]);

  // Connect to SSE stream when workspaceId is available
  useEffect(() => {
    if (!workspaceId) return;

    let handle: WorkspaceEventSourceHandle | null = null;

    handle = createWorkspaceEventSource(workspaceId, {
      token,
      onConnected: () => {
        setIsSyncing(false);
      },
      onSyncComplete: (event) => {
        setLastSyncEvent(event);
        setIsSyncing(true);

        const badgeText = formatSyncBadgeText(event);
        setSyncBadgeText(badgeText);

        // Notify subscribers (graph canvas, Briefing view, etc.)
        for (const cb of listenersRef.current) {
          try {
            cb(event);
          } catch (err) {
            console.error('[graph-sync] Error in sync listener callback:', err);
          }
        }

        // Auto-fade badge after 5 seconds
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          setSyncBadgeText(null);
          setIsSyncing(false);
          timerRef.current = null;
        }, 5000);
      },
      onError: () => {
        // Handled internally by events-client reconnect
      },
    });

    return () => {
      if (handle) {
        handle.close();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [workspaceId, token]);

  const value = useMemo<GraphSyncState>(
    () => ({
      hoveredNodeId,
      selectedNodeId,
      highlightedIds,
      focusRequest,
      setHoveredNode,
      setSelectedNode,
      focusNode,
      clearSelection,
      setHighlightedIds,
      lastSyncEvent,
      isSyncing,
      syncBadgeText,
      clearSyncBadge,
      subscribeSync,
    }),
    [
      hoveredNodeId,
      selectedNodeId,
      highlightedIds,
      focusRequest,
      setHoveredNode,
      setSelectedNode,
      focusNode,
      clearSelection,
      setHighlightedIds,
      lastSyncEvent,
      isSyncing,
      syncBadgeText,
      clearSyncBadge,
      subscribeSync,
    ]
  );

  return <GraphSyncContext.Provider value={value}>{children}</GraphSyncContext.Provider>;
}

export function useGraphSync(): GraphSyncState {
  const context = useContext(GraphSyncContext);
  if (!context) {
    // Return safe no-op implementation when used outside provider in tests
    return {
      hoveredNodeId: null,
      selectedNodeId: null,
      highlightedIds: [],
      focusRequest: null,
      setHoveredNode: () => {},
      setSelectedNode: () => {},
      focusNode: () => {},
      clearSelection: () => {},
      setHighlightedIds: () => {},
      lastSyncEvent: null,
      isSyncing: false,
      syncBadgeText: null,
      clearSyncBadge: () => {},
      subscribeSync: () => () => {},
    };
  }
  return context;
}
