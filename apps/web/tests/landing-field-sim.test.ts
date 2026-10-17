import { describe, it, expect } from 'vitest';
import {
  createField,
  createRng,
  nodeCountFor,
  resizeField,
  stepField,
} from '@/lib/landing/field-sim';

describe('landing graph field simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = createField(1200, 800, createRng(42));
    const b = createField(1200, 800, createRng(42));
    expect(a.nodes).toEqual(b.nodes);
  });

  it('scales node count with area within sane bounds', () => {
    expect(nodeCountFor(100, 100)).toBe(16);
    expect(nodeCountFor(1440, 900)).toBeGreaterThan(16);
    expect(nodeCountFor(8000, 8000)).toBe(80);
  });

  it('keeps nodes near the viewport while stepping', () => {
    const rng = createRng(7);
    const field = createField(800, 600, rng);
    for (let i = 0; i < 600; i++) stepField(field, 1 / 60, rng);
    for (const n of field.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(-24);
      expect(n.x).toBeLessThanOrEqual(824);
      expect(n.y).toBeGreaterThanOrEqual(-24);
      expect(n.y).toBeLessThanOrEqual(624);
    }
  });

  it('spawns traversal pulses that light up nodes and eventually expire', () => {
    const rng = createRng(3);
    const field = createField(1200, 800, rng);
    let sawPulse = false;
    let sawGlow = false;
    for (let i = 0; i < 60 * 12; i++) {
      stepField(field, 1 / 60, rng);
      if (field.pulses.length > 0) sawPulse = true;
      if (field.nodes.some((n) => n.glow > 0.9)) sawGlow = true;
    }
    expect(sawPulse).toBe(true);
    expect(sawGlow).toBe(true);
    expect(field.pulses.length).toBeLessThanOrEqual(3);
  });

  it('clamps large time deltas (tab switches) so nodes do not teleport', () => {
    const rng = createRng(1);
    const field = createField(800, 600, rng);
    const before = field.nodes.map((n) => ({ x: n.x, y: n.y }));
    stepField(field, 30, rng);
    field.nodes.forEach((n, i) => {
      expect(Math.hypot(n.x - before[i]!.x, n.y - before[i]!.y)).toBeLessThan(2);
    });
  });

  it('resizes by rescaling and adjusting the node population', () => {
    const rng = createRng(5);
    const field = createField(1000, 800, rng);
    resizeField(field, 2000, 1600, rng);
    expect(field.width).toBe(2000);
    expect(field.nodes.length).toBe(nodeCountFor(2000, 1600));
    resizeField(field, 400, 300, rng);
    expect(field.nodes.length).toBe(nodeCountFor(400, 300));
  });
});
