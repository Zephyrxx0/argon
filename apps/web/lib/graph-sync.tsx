'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface FocusRequest {
  nodeId: string;
  timestamp: number;
}

export interface GraphSyncState {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  highlightedIds: string[];
  focusRequest: FocusRequest | null;
  setHoveredNode: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  focusNode: (id: string) => void;
  clearSelection: () => void;
  setHighlightedIds: (ids: string[]) => void;
}

const GraphSyncContext = createContext<GraphSyncState | null>(null);

export function GraphSyncProvider({ children }: { children: React.ReactNode }) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIdsState] = useState<string[]>([]);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

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
    };
  }
  return context;
}
