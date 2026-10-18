import { cleanId, type FlowEdge, type FlowNode } from './model';

export interface Neighborhood {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/** The node, its direct neighbours, and the edges between them and the node. */
export function closedNeighborhood(nodeId: string, edges: FlowEdge[]): Neighborhood {
  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) {
      edgeIds.add(e.id);
      nodeIds.add(e.source);
      nodeIds.add(e.target);
    }
  }
  return { nodeIds, edgeIds };
}

/** The union of the closed neighbourhoods of several nodes (several cited nodes lit up together). */
export function unionNeighborhood(nodeIds: string[], edges: FlowEdge[]): Neighborhood {
  const out: Neighborhood = { nodeIds: new Set(), edgeIds: new Set() };
  for (const id of nodeIds) {
    const hood = closedNeighborhood(id, edges);
    for (const n of hood.nodeIds) out.nodeIds.add(n);
    for (const e of hood.edgeIds) out.edgeIds.add(e);
  }
  return out;
}

/**
 * Maps an id coming from elsewhere in the UI (evidence cards use `#id`, the graph may or may
 * not) onto the id actually present in the graph. Returns null when there is no such node.
 */
export function resolveNodeId(nodes: Pick<FlowNode, 'id'>[], id: string | null | undefined): string | null {
  if (!id) return null;
  const wanted = cleanId(id);
  return nodes.find((n) => cleanId(n.id) === wanted)?.id ?? null;
}
