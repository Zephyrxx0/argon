import dagre from '@dagrejs/dagre';
import { NODE_SIZE, type FlowEdge, type FlowNode, type LayoutDirection } from './model';

/**
 * Layered (dagre) layout. Architecture graphs have a natural direction — people, files and
 * decisions point at components, old decisions point at their replacements — so a layered
 * layout reads far better than a force simulation and is stable between renders.
 */
export function boundsOf(nodes: FlowNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const { width, height } = NODE_SIZE[n.data.kind];
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + width);
    maxY = Math.max(maxY, n.position.y + height);
  }
  return { width: maxX - minX, height: maxY - minY };
}

/** The zoom level at which a laid-out graph would fit a container (before padding). */
export function fitZoom(nodes: FlowNode[], container: { width: number; height: number }): number {
  const b = boundsOf(nodes);
  if (b.width === 0 || b.height === 0 || container.width === 0 || container.height === 0) return 1;
  return Math.min(container.width / b.width, container.height / b.height);
}

/**
 * Picks the reading direction that lets the graph render largest in the given container
 * (left→right for wide panes, top→bottom for tall/narrow ones), so text stays legible.
 */
export function pickDirection(
  nodes: FlowNode[],
  edges: FlowEdge[],
  container: { width: number; height: number }
): LayoutDirection {
  if (container.width === 0 || nodes.length === 0) return 'LR';
  const lr = fitZoom(layoutGraph(nodes, edges, 'LR'), container);
  const tb = fitZoom(layoutGraph(nodes, edges, 'TB'), container);
  return tb > lr * 1.05 ? 'TB' : 'LR';
}

export function layoutGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: LayoutDirection = 'LR'
): FlowNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 24 : 32,
    ranksep: direction === 'LR' ? 84 : 72,
    marginx: 24,
    marginy: 24,
  });

  for (const n of nodes) {
    const { width, height } = NODE_SIZE[n.data.kind];
    g.setNode(n.id, { width, height });
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const { width, height } = NODE_SIZE[n.data.kind];
    return {
      ...n,
      // dagre returns centres; React Flow positions by top-left corner
      position: { x: Math.round(pos.x - width / 2), y: Math.round(pos.y - height / 2) },
      data: { ...n.data, direction },
    };
  });
}
