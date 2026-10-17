import type { Edge, Node } from '@xyflow/react';
import type { CytoscapeElements } from '@argon/graph';

/** The `@argon/graph` payload shape (historically named after Cytoscape; it is library-agnostic). */
export type GraphElements = CytoscapeElements;

export type NodeKind = 'component' | 'decision' | 'person' | 'file' | 'entity';

export type NodeVisual = 'idle' | 'active' | 'dim';

export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  /** the raw type string from the graph ("Component", "Decision", ...) */
  type: string;
  properties: Record<string, unknown>;
  superseded: boolean;
  visual: NodeVisual;
  selected: boolean;
  pulse: boolean;
  direction: LayoutDirection;
}

export interface GraphEdgeData extends Record<string, unknown> {
  label: string;
  /** true for SUPERSEDES / SUPERSEDED_BY — rendered as a state (danger) edge */
  supersession: boolean;
  visual: NodeVisual;
}

export type LayoutDirection = 'LR' | 'TB';
export type FlowNode = Node<GraphNodeData>;
export type FlowEdge = Edge<GraphEdgeData>;

/**
 * Every node type has a fixed footprint. Text inside is clamped to fit it (full text lives in
 * the inspector), which keeps layout deterministic and guarantees copy never spills out.
 */
export const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  component: { width: 232, height: 92 },
  decision: { width: 252, height: 112 },
  person: { width: 216, height: 68 },
  file: { width: 232, height: 44 },
  entity: { width: 200, height: 56 },
};

export const MAX_NODES = 150;
export const MAX_EDGES = 300;

export function kindOf(type: string | undefined): NodeKind {
  switch ((type ?? '').toLowerCase()) {
    case 'component':
      return 'component';
    case 'decision':
    case 'adr':
    case 'rfc':
      return 'decision';
    case 'person':
    case 'author':
    case 'contributor':
      return 'person';
    case 'file':
      return 'file';
    default:
      return 'entity';
  }
}

const isSupersession = (label: string) => /supersed/i.test(label);

/** Strip the citation prefixes used by briefings (`#`, `d:`, `c:`, ...) when comparing ids. */
export function cleanId(id: string): string {
  return id.startsWith('#') ? id.slice(1) : id;
}

/**
 * Converts the graph payload into React Flow nodes/edges.
 * - de-duplicates nodes/edges by id (the first occurrence wins, so an active decision is
 *   never overwritten by the same id appearing as a precedent)
 * - drops edges whose endpoints are missing
 * - bounds the payload
 * Positions are filled in by `layoutGraph`.
 */
export function buildFlowGraph(
  elements: GraphElements,
  direction: LayoutDirection = 'LR'
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const seen = new Set<string>();

  for (const { data } of elements.nodes) {
    if (!data?.id || seen.has(data.id) || nodes.length >= MAX_NODES) continue;
    seen.add(data.id);
    const kind = kindOf(data.type);
    const properties = data.properties ?? {};
    const status = String(properties.status ?? '').toLowerCase();
    nodes.push({
      id: data.id,
      type: kind,
      ariaLabel: `${data.type || 'Entity'}: ${data.label || data.id}`,
      position: { x: 0, y: 0 },
      width: NODE_SIZE[kind].width,
      height: NODE_SIZE[kind].height,
      data: {
        label: data.label || data.id,
        kind,
        type: data.type || 'Entity',
        properties,
        superseded: status === 'superseded',
        visual: 'idle',
        selected: false,
        pulse: false,
        direction,
      },
    });
  }

  const edges: FlowEdge[] = [];
  const edgeIds = new Set<string>();
  for (const { data } of elements.edges) {
    if (!data?.id || edgeIds.has(data.id) || edges.length >= MAX_EDGES) continue;
    if (!seen.has(data.source) || !seen.has(data.target)) continue;
    edgeIds.add(data.id);
    edges.push({
      id: data.id,
      source: data.source,
      target: data.target,
      type: 'relation',
      data: {
        label: data.label || '',
        supersession: isSupersession(data.label || ''),
        visual: 'idle',
      },
    });
  }

  return { nodes, edges };
}
