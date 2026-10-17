import { describe, it, expect } from 'vitest';
import { buildFlowGraph, kindOf, NODE_SIZE, type GraphElements } from '@/lib/graph/model';
import { layoutGraph, pickDirection, boundsOf } from '@/lib/graph/layout';
import { closedNeighborhood, resolveNodeId } from '@/lib/graph/focus';

const node = (id: string, type: string, properties: Record<string, unknown> = {}, label = id) => ({
  data: { id, label, type, properties },
});
const edge = (id: string, source: string, target: string, label = 'GOVERNS') => ({
  data: { id, source, target, label, properties: {} },
});

const elements: GraphElements = {
  nodes: [
    node('c:billing', 'Component'),
    node('d:2', 'Decision', { status: 'active' }),
    node('d:1', 'Decision', { status: 'superseded' }),
    node('p:alice', 'Person'),
    node('f:a.ts', 'File'),
    node('d:2', 'Decision', { status: 'superseded' }), // duplicate id: first one wins
  ],
  edges: [
    edge('e1', 'd:2', 'c:billing'),
    edge('e2', 'd:1', 'd:2', 'SUPERSEDED_BY'),
    edge('e3', 'p:alice', 'c:billing', 'OWNS'),
    edge('e4', 'f:a.ts', 'c:billing', 'DEFINES'),
    edge('e5', 'ghost', 'c:billing'), // dangling
    edge('e1', 'd:2', 'c:billing'), // duplicate id
  ],
};

describe('graph model', () => {
  it('maps graph types to node kinds', () => {
    expect(kindOf('Component')).toBe('component');
    expect(kindOf('decision')).toBe('decision');
    expect(kindOf('Author')).toBe('person');
    expect(kindOf('File')).toBe('file');
    expect(kindOf('Whatever')).toBe('entity');
  });

  it('de-duplicates nodes/edges, drops dangling edges, flags supersession', () => {
    const { nodes, edges } = buildFlowGraph(elements);
    expect(nodes.map((n) => n.id)).toEqual(['c:billing', 'd:2', 'd:1', 'p:alice', 'f:a.ts']);
    expect(nodes.find((n) => n.id === 'd:2')!.data.superseded).toBe(false);
    expect(nodes.find((n) => n.id === 'd:1')!.data.superseded).toBe(true);
    expect(edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(edges.find((e) => e.id === 'e2')!.data!.supersession).toBe(true);
    expect(edges.find((e) => e.id === 'e1')!.data!.supersession).toBe(false);
  });

  it('gives every node the fixed footprint of its kind', () => {
    const { nodes } = buildFlowGraph(elements);
    for (const n of nodes) {
      expect(n.width).toBe(NODE_SIZE[n.data.kind].width);
      expect(n.height).toBe(NODE_SIZE[n.data.kind].height);
    }
  });
});

describe('co-change (file) graph elements', () => {
  const files: GraphElements = {
    nodes: [
      node('src/a.ts', 'File', { path: 'src/a.ts', component: 'src', touches: 12 }),
      node('src/b.ts', 'File', { path: 'src/b.ts', component: 'src', touches: 9 }),
    ],
    edges: [
      { data: { id: 'co:src/a.ts->src/b.ts', source: 'src/a.ts', target: 'src/b.ts', label: 'CO_CHANGES', properties: { weight: 0.62, count: 5 } } },
      // other relations never get a weight/caption, whatever their properties hold
      { data: { id: 'own', source: 'src/a.ts', target: 'src/b.ts', label: 'OWNS', properties: { weight: 0.9, count: 3 } } },
    ],
  };

  it('turns CO_CHANGES strength into edge weight and an `N×` caption', () => {
    const { nodes, edges } = buildFlowGraph(files);
    expect(nodes.every((n) => n.type === 'file' && n.data.kind === 'file')).toBe(true);
    expect(edges[0]!.data).toMatchObject({ label: 'CO_CHANGES', weight: 0.62, caption: '5×', supersession: false });
    expect(edges[1]!.data).not.toHaveProperty('weight');
    expect(edges[1]!.data).not.toHaveProperty('caption');
  });

  it('clamps out-of-range weights and ignores missing ones', () => {
    const { edges } = buildFlowGraph({
      nodes: files.nodes,
      edges: [
        { data: { id: 'x', source: 'src/a.ts', target: 'src/b.ts', label: 'CO_CHANGES', properties: { weight: 7, count: 2 } } },
        { data: { id: 'y', source: 'src/b.ts', target: 'src/a.ts', label: 'CO_CHANGES', properties: {} } },
      ],
    });
    expect(edges[0]!.data!.weight).toBe(1);
    expect(edges[1]!.data).not.toHaveProperty('weight');
    expect(edges[1]!.data).not.toHaveProperty('caption');
  });
});

describe('graph layout', () => {
  const { nodes, edges } = buildFlowGraph(elements);

  it('lays out sources before targets without overlapping nodes', () => {
    const laid = layoutGraph(nodes, edges, 'LR');
    const pos = Object.fromEntries(laid.map((n) => [n.id, n.position]));
    expect(pos['d:2']!.x).toBeLessThan(pos['c:billing']!.x);
    expect(pos['d:1']!.x).toBeLessThan(pos['d:2']!.x);

    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const a = laid[i]!, b = laid[j]!;
        const sa = NODE_SIZE[a.data.kind], sb = NODE_SIZE[b.data.kind];
        const overlap =
          a.position.x < b.position.x + sb.width && b.position.x < a.position.x + sa.width &&
          a.position.y < b.position.y + sb.height && b.position.y < a.position.y + sa.height;
        expect(overlap).toBe(false);
      }
    }
  });

  it('top-down layout flows downward', () => {
    const laid = layoutGraph(nodes, edges, 'TB');
    const y = Object.fromEntries(laid.map((n) => [n.id, n.position.y]));
    expect(y['d:2']).toBeLessThan(y['c:billing']!);
    expect(laid.every((n) => n.data.direction === 'TB')).toBe(true);
  });

  it('prefers the direction that renders larger in the container', () => {
    const wide = pickDirection(nodes, edges, { width: 1600, height: 500 });
    const tall = pickDirection(nodes, edges, { width: 420, height: 1200 });
    expect(wide).toBe('LR');
    expect(tall).toBe('TB');
    expect(boundsOf(layoutGraph(nodes, edges, 'LR')).width).toBeGreaterThan(0);
  });
});

describe('graph focus', () => {
  const { nodes, edges } = buildFlowGraph(elements);

  it('computes the closed neighbourhood of a node', () => {
    const hood = closedNeighborhood('d:2', edges);
    expect([...hood.nodeIds].sort()).toEqual(['c:billing', 'd:1', 'd:2']);
    expect([...hood.edgeIds].sort()).toEqual(['e1', 'e2']);
  });

  it('resolves citation ids (#-prefixed or not) onto graph ids', () => {
    expect(resolveNodeId(nodes, '#c:billing')).toBe('c:billing');
    expect(resolveNodeId([{ id: '#c:x' }], 'c:x')).toBe('#c:x');
    expect(resolveNodeId(nodes, 'nope')).toBeNull();
    expect(resolveNodeId(nodes, null)).toBeNull();
  });
});
