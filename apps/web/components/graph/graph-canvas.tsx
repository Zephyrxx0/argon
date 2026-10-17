'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeChange,
  type FitViewOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { clsx } from 'clsx';
import { useGraphSync } from '@/lib/graph-sync';
import { closedNeighborhood, resolveNodeId } from '@/lib/graph/focus';
import { layoutGraph, pickDirection } from '@/lib/graph/layout';
import {
  buildFlowGraph,
  type GraphElements,
  type FlowEdge,
  type FlowNode,
  type LayoutDirection,
  type NodeKind,
} from '@/lib/graph/model';
import { NodeInspector, type InspectedNode } from '@/components/canvas/node-inspector';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { GraphHud } from './graph-hud';
import { GraphLegend } from './graph-legend';

export interface GraphCanvasProps {
  /** The graph to draw. Nothing is substituted when it is missing: the canvas shows `status`. */
  elements?: GraphElements | null;
  /** What to show instead of a graph while there is none. */
  status?: { kind: 'loading' | 'error' | 'empty'; message?: string };
  onNodeSelect?: (nodeId: string) => void;
  className?: string;
}

// Leaves room for the legend (top) and toolbar (bottom) so they never sit on top of nodes
const FIT_PADDING: NonNullable<FitViewOptions['padding']> = { top: '64px', right: '28px', bottom: '64px', left: '28px' };
const MINIMAP_MIN_NODES = 14;
// Small graphs should not be blown up to fill the pane: cap the zoom so text stays reasonably sized
const FIT_MAX_ZOOM = 1.1;

const MINIMAP_SHADE: Record<NodeKind, string> = {
  component: '#ffffff',
  decision: '#bdbdbd',
  person: '#8a8a8a',
  file: '#555555',
  entity: '#555555',
};

function GraphCanvasInner({ elements, status, onNodeSelect, className }: GraphCanvasProps) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const { hoveredNodeId, selectedNodeId, focusRequest, setSelectedNode, lastSyncEvent } = useGraphSync();

  // null = automatic (best fit for the pane); set once the user picks a direction explicitly
  const [manualDirection, setManualDirection] = useState<LayoutDirection | null>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [hiddenKinds, setHiddenKinds] = useState<Set<NodeKind>>(new Set());
  const [localHover, setLocalHover] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Record<string, { x: number; y: number }>>({});
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());
  const [supersededIds, setSupersededIds] = useState<Set<string>>(new Set());

  const source = useMemo<GraphElements>(() => elements ?? { nodes: [], edges: [] }, [elements]);

  // 1. Parse → 2. filter by legend → 3. layout (all pure, memoised)
  const parsedBase = useMemo(() => buildFlowGraph(source, 'LR'), [source]);

  const counts = useMemo(() => {
    const c: Partial<Record<NodeKind, number>> = {};
    for (const n of parsedBase.nodes) c[n.data.kind] = (c[n.data.kind] ?? 0) + 1;
    return c;
  }, [parsedBase.nodes]);

  const visible = useMemo(() => {
    const nodes = parsedBase.nodes.filter((n) => !hiddenKinds.has(n.data.kind));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = parsedBase.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  }, [parsedBase, hiddenKinds]);

  const direction: LayoutDirection = useMemo(
    () => manualDirection ?? pickDirection(visible.nodes, visible.edges, paneSize),
    [manualDirection, visible, paneSize]
  );

  const laidOut = useMemo(
    () => layoutGraph(visible.nodes, visible.edges, direction),
    // layoutNonce forces a fresh layout (and clears manual drags) on "re-run layout"
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, direction, layoutNonce]
  );

  // Manual drags are discarded whenever the underlying layout is recomputed
  useEffect(() => setDragged({}), [laidOut]);

  // Interaction state → visuals
  const selectedId = inspectedId ?? resolveNodeId(laidOut, selectedNodeId);
  const focusId = localHover ?? resolveNodeId(laidOut, hoveredNodeId) ?? selectedId;

  const { nodes, edges } = useMemo(() => {
    const hood = focusId ? closedNeighborhood(focusId, visible.edges) : null;
    const hasFocus = Boolean(hood && laidOut.some((n) => n.id === focusId));

    const nodes: FlowNode[] = laidOut.map((n) => ({
      ...n,
      position: dragged[n.id] ?? n.position,
      selected: false, // selection styling is owned by data.selected, not RF's own class
      data: {
        ...n.data,
        superseded: n.data.superseded || supersededIds.has(n.id),
        selected: n.id === selectedId,
        pulse: pulseIds.has(n.id),
        visual: !hasFocus ? 'idle' : hood!.nodeIds.has(n.id) ? 'active' : 'dim',
      },
    }));

    const edges: FlowEdge[] = visible.edges.map((e) => {
      const visual = !hasFocus ? 'idle' : hood!.edgeIds.has(e.id) ? 'active' : 'dim';
      const color = e.data?.supersession ? '#ff4d4d' : visual === 'active' ? '#ffffff' : '#5a5a5a';
      return {
        ...e,
        data: { ...e.data!, visual },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      };
    });

    return { nodes, edges };
  }, [laidOut, visible.edges, dragged, focusId, selectedId, pulseIds, supersededIds]);

  const inspected: InspectedNode | null = useMemo(() => {
    if (!inspectedId) return null;
    const n = parsedBase.nodes.find((x) => x.id === inspectedId);
    return n
      ? { id: n.id, label: n.data.label, type: n.data.type, properties: n.data.properties }
      : null;
  }, [inspectedId, parsedBase.nodes]);

  // Re-fit when the layout changes
  const layoutKey = `${laidOut.map((n) => n.id).join('|')}::${direction}::${layoutNonce}`;
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitView({ duration: 350, padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM }));
    return () => cancelAnimationFrame(raf);
  }, [layoutKey, fitView]);

  // Re-fit when the pane goes from hidden (0×0, inactive tab) to visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let wasEmpty = el.clientWidth === 0 || el.clientHeight === 0;
    setPaneSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(() => {
      const empty = el.clientWidth === 0 || el.clientHeight === 0;
      // Quantise so dragging the split handle doesn't relayout on every pixel
      setPaneSize((prev) => {
        const w = Math.round(el.clientWidth / 80) * 80;
        const h = Math.round(el.clientHeight / 80) * 80;
        return prev.width === w && prev.height === h ? prev : { width: w, height: h };
      });
      if (wasEmpty && !empty) fitView({ duration: 0, padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM });
      wasEmpty = empty;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitView]);

  // A briefing citation asked us to focus a node
  useEffect(() => {
    if (!focusRequest) return;
    const id = resolveNodeId(laidOut, focusRequest.nodeId);
    if (!id) return;
    const hood = closedNeighborhood(id, visible.edges);
    setInspectedId(null);
    fitView({
      nodes: [...hood.nodeIds].map((nid) => ({ id: nid })),
      duration: 500,
      padding: 0.35,
      maxZoom: 1.1,
    });
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live incremental sync: pulse touched nodes, retire superseded decisions
  useEffect(() => {
    if (!lastSyncEvent) return;
    const known = new Set(parsedBase.nodes.map((n) => n.id));
    const expand = (id: string, prefixes: string[]) =>
      [id, ...prefixes.map((p) => `${p}${id}`)].filter((c) => known.has(c));

    const superseded = lastSyncEvent.superseded.flatMap((id) => expand(id, ['d:', 'dec:']));
    const touched = [
      ...lastSyncEvent.updated.commits.flatMap((c) => expand(c, ['cm:', 'commit:'])),
      ...lastSyncEvent.updated.files.flatMap((f) => expand(f, ['f:', 'file:'])),
      ...lastSyncEvent.updated.decisions.flatMap((d) => expand(d, ['d:', 'dec:'])),
    ];

    if (superseded.length > 0) setSupersededIds((prev) => new Set([...prev, ...superseded]));
    if (touched.length === 0) return;
    setPulseIds(new Set(touched));
    const timer = setTimeout(() => setPulseIds(new Set()), 2000);
    return () => clearTimeout(timer);
  }, [lastSyncEvent, parsedBase.nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setDragged((prev) => {
      let next = prev;
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          if (next === prev) next = { ...prev };
          next[c.id] = c.position;
        }
      }
      return next;
    });
  }, []);

  const toggleKind = useCallback((kind: NodeKind) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const empty = nodes.length === 0;

  return (
    <div
      ref={containerRef}
      data-testid="graph-canvas"
      className={clsx('relative h-full w-full overflow-hidden bg-black font-mono', className)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          setInspectedId(node.id);
          setSelectedNode(node.id);
          onNodeSelect?.(node.id);
        }}
        onNodeMouseEnter={(_, node) => setLocalHover(node.id)}
        onNodeMouseLeave={() => setLocalHover(null)}
        onPaneClick={() => {
          setInspectedId(null);
          setSelectedNode(null);
        }}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.15}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM }}
        proOptions={{ hideAttribution: false }}
        attributionPosition="bottom-center"
        colorMode="dark"
        className="!bg-black"
      >
        <Background variant={BackgroundVariant.Lines} gap={48} lineWidth={1} color="#111111" />
        {nodes.length >= MINIMAP_MIN_NODES && (
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          ariaLabel="Graph overview"
          nodeColor={(n) => MINIMAP_SHADE[(n.data as FlowNode['data'])?.kind ?? 'entity']}
          nodeStrokeWidth={0}
          nodeBorderRadius={0}
          maskColor="rgba(0,0,0,0.78)"
          className="!hidden md:!block !m-4 !mb-9 !border !border-white/30 !bg-black"
          style={{ width: 160, height: 104 }}
        />
        )}
      </ReactFlow>

      <GraphLegend counts={counts} hidden={hiddenKinds} onToggle={toggleKind} />

      {empty && (
        <div
          data-testid={status?.kind === 'loading' ? 'graph-loading' : status?.kind === 'error' ? 'graph-error' : 'graph-empty'}
          role={status?.kind === 'error' ? 'alert' : 'status'}
          className={clsx(
            'pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-xs uppercase tracking-[0.2em]',
            status?.kind === 'error' ? 'text-danger' : 'text-white/50'
          )}
        >
          {parsedBase.nodes.length > 0
            ? 'All node types hidden — re-enable one in the legend'
            : status?.message ||
              (status?.kind === 'loading'
                ? 'Reading graph…'
                : status?.kind === 'error'
                  ? 'Graph unavailable'
                  : 'No graph data')}
        </div>
      )}

      <GraphHud
        direction={direction}
        onDirectionChange={setManualDirection}
        onRelayout={() => setLayoutNonce((n) => n + 1)}
      />

      <NodeInspector
        node={inspected}
        onClose={() => {
          setInspectedId(null);
          setSelectedNode(null);
        }}
        className="!left-auto !right-4 !top-4"
      />
    </div>
  );
}

/** React Flow powered graph canvas. Replaces the old Cytoscape canvas. */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
