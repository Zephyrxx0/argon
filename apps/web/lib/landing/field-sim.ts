/**
 * Pure simulation for the landing-page graph field.
 * Kept free of DOM/canvas access so it is deterministic and unit-testable.
 * The node vocabulary mirrors the in-app graph canvas:
 *   component = square, decision = diamond, file = small block, person = circle.
 */

export type NodeKind = 'component' | 'decision' | 'file' | 'person';

export interface FieldNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: NodeKind;
  size: number;
  /** 0..1 — brightness boost while a traversal pulse passes through */
  glow: number;
}

export interface Pulse {
  /** node indices, in traversal order */
  path: number[];
  /** fractional hop index: 2.4 = 40% along the 3rd edge */
  progress: number;
}

export interface Field {
  width: number;
  height: number;
  linkDistance: number;
  nodes: FieldNode[];
  pulses: Pulse[];
  /** seconds until the next pulse spawns */
  nextPulseIn: number;
}

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so tests/snapshots are stable. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIND_WEIGHTS: Array<[NodeKind, number]> = [
  ['file', 0.5],
  ['component', 0.2],
  ['decision', 0.15],
  ['person', 0.15],
];

function pickKind(rng: Rng): NodeKind {
  let roll = rng();
  for (const [kind, weight] of KIND_WEIGHTS) {
    if (roll < weight) return kind;
    roll -= weight;
  }
  return 'file';
}

const SIZE_BY_KIND: Record<NodeKind, number> = {
  component: 7,
  decision: 7,
  person: 4.5,
  file: 3,
};

export function nodeCountFor(width: number, height: number): number {
  return Math.max(16, Math.min(80, Math.round((width * height) / 24000)));
}

export function linkDistanceFor(width: number, height: number): number {
  return Math.max(110, Math.min(190, Math.min(width, height) * 0.24));
}

export function createField(width: number, height: number, rng: Rng = Math.random): Field {
  const count = nodeCountFor(width, height);
  const nodes: FieldNode[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pickKind(rng);
    const speed = 6 + rng() * 10; // px/s — slow drift, never distracting
    const angle = rng() * Math.PI * 2;
    nodes.push({
      x: rng() * width,
      y: rng() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      kind,
      size: SIZE_BY_KIND[kind],
      glow: 0,
    });
  }
  return {
    width,
    height,
    linkDistance: linkDistanceFor(width, height),
    nodes,
    pulses: [],
    nextPulseIn: 0.8,
  };
}

/** Keep the existing nodes on resize; add/drop to match the new target density. */
export function resizeField(field: Field, width: number, height: number, rng: Rng = Math.random) {
  const sx = field.width > 0 ? width / field.width : 1;
  const sy = field.height > 0 ? height / field.height : 1;
  for (const n of field.nodes) {
    n.x *= sx;
    n.y *= sy;
  }
  field.width = width;
  field.height = height;
  field.linkDistance = linkDistanceFor(width, height);

  const target = nodeCountFor(width, height);
  if (field.nodes.length > target) {
    field.nodes.length = target;
    field.pulses = [];
  } else {
    const extra = createField(width, height, rng).nodes.slice(0, target - field.nodes.length);
    field.nodes.push(...extra);
  }
}

function dist(a: FieldNode, b: FieldNode) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Greedy walk to the nearest unvisited neighbour — reads as a graph traversal. */
export function buildPulsePath(field: Field, rng: Rng, maxHops = 5): number[] {
  const { nodes, linkDistance } = field;
  if (nodes.length < 2) return [];

  // Prefer starting from a "meaningful" node (component/decision)
  const anchors = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.kind === 'component' || n.kind === 'decision');
  const pool = anchors.length > 0 ? anchors : nodes.map((n, i) => ({ n, i }));
  const start = pool[Math.floor(rng() * pool.length)]!.i;

  const path = [start];
  const visited = new Set(path);
  for (let hop = 0; hop < maxHops; hop++) {
    const current = nodes[path[path.length - 1]!]!;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (visited.has(j)) continue;
      const d = dist(current, nodes[j]!);
      // jitter keeps repeated pulses from retracing the identical route
      const score = d * (0.75 + rng() * 0.5);
      if (d < linkDistance && score < bestDist) {
        best = j;
        bestDist = score;
      }
    }
    if (best === -1) break;
    path.push(best);
    visited.add(best);
  }
  return path.length >= 3 ? path : [];
}

export interface Pointer {
  x: number;
  y: number;
}

const PULSE_SPEED = 1.6; // hops / second
const GLOW_DECAY = 1.1; // per second

export function stepField(field: Field, dt: number, rng: Rng = Math.random) {
  const { nodes, width, height } = field;
  const clamped = Math.min(dt, 0.05); // avoid jumps after tab switches

  for (const n of nodes) {
    n.x += n.vx * clamped;
    n.y += n.vy * clamped;
    // Bounce softly at the edges (slightly outside the viewport so nodes enter/leave naturally)
    const pad = 24;
    if (n.x < -pad) { n.x = -pad; n.vx = Math.abs(n.vx); }
    if (n.x > width + pad) { n.x = width + pad; n.vx = -Math.abs(n.vx); }
    if (n.y < -pad) { n.y = -pad; n.vy = Math.abs(n.vy); }
    if (n.y > height + pad) { n.y = height + pad; n.vy = -Math.abs(n.vy); }
    n.glow = Math.max(0, n.glow - GLOW_DECAY * clamped);
  }

  // Advance pulses and light the nodes they have reached
  for (const pulse of field.pulses) {
    pulse.progress += PULSE_SPEED * clamped;
    const reached = Math.min(pulse.path.length - 1, Math.floor(pulse.progress));
    for (let i = 0; i <= reached; i++) {
      const node = nodes[pulse.path[i]!];
      if (node) node.glow = 1;
    }
  }
  field.pulses = field.pulses.filter((p) => p.progress < p.path.length + 1.2);

  field.nextPulseIn -= clamped;
  if (field.nextPulseIn <= 0) {
    const path = buildPulsePath(field, rng);
    if (path.length > 0 && field.pulses.length < 3) {
      field.pulses.push({ path, progress: 0 });
    }
    field.nextPulseIn = 1.8 + rng() * 2.2;
  }
}
