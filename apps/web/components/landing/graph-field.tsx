'use client';

import React, { useEffect, useRef } from 'react';
import {
  createField,
  resizeField,
  stepField,
  type Field,
  type FieldNode,
  type Pointer,
} from '@/lib/landing/field-sim';

const INK = '255,255,255';

function drawNode(ctx: CanvasRenderingContext2D, n: FieldNode) {
  const alpha = 0.28 + n.glow * 0.72;
  ctx.lineWidth = n.kind === 'component' ? 1.5 : 1;
  ctx.strokeStyle = `rgba(${INK},${alpha})`;
  ctx.fillStyle = n.glow > 0.35 ? `rgba(${INK},${alpha})` : '#000';
  const s = n.size;

  ctx.beginPath();
  switch (n.kind) {
    case 'component':
      ctx.rect(n.x - s, n.y - s, s * 2, s * 2);
      break;
    case 'decision':
      ctx.moveTo(n.x, n.y - s * 1.3);
      ctx.lineTo(n.x + s * 1.3, n.y);
      ctx.lineTo(n.x, n.y + s * 1.3);
      ctx.lineTo(n.x - s * 1.3, n.y);
      ctx.closePath();
      break;
    case 'person':
      ctx.arc(n.x, n.y, s, 0, Math.PI * 2);
      break;
    case 'file':
      ctx.rect(n.x - s, n.y - s * 0.7, s * 2, s * 1.4);
      break;
  }
  ctx.fill();
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, field: Field, pointer: Pointer | null) {
  const { nodes, linkDistance, width, height } = field;
  ctx.clearRect(0, 0, width, height);

  // Proximity edges
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < linkDistance) {
        ctx.strokeStyle = `rgba(${INK},${(1 - d / linkDistance) * 0.22})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  // Pointer links — the cursor behaves like a query node
  if (pointer) {
    const reach = linkDistance * 1.25;
    for (const n of nodes) {
      const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
      if (d < reach) {
        ctx.strokeStyle = `rgba(${INK},${(1 - d / reach) * 0.55})`;
        ctx.beginPath();
        ctx.moveTo(pointer.x, pointer.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
      }
    }
  }

  // Traversal pulses
  for (const pulse of field.pulses) {
    const full = Math.min(Math.floor(pulse.progress), pulse.path.length - 1);
    ctx.strokeStyle = `rgba(${INK},0.9)`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < full; i++) {
      const a = nodes[pulse.path[i]!];
      const b = nodes[pulse.path[i + 1]!];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Partial edge to the pulse head
    if (full < pulse.path.length - 1) {
      const a = nodes[pulse.path[full]!];
      const b = nodes[pulse.path[full + 1]!];
      if (a && b) {
        const t = pulse.progress - full;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        ctx.stroke();
      }
    }
  }

  for (const n of nodes) drawNode(ctx, n);
}

export interface GraphFieldProps {
  className?: string;
}

/**
 * Decorative, non-interactive background: a slowly drifting knowledge graph with
 * occasional traversal pulses. Honors prefers-reduced-motion (renders one still
 * frame) and pauses when scrolled offscreen or the tab is hidden.
 */
export function GraphField({ className }: GraphFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let field: Field | null = null;
    let pointer: Pointer | null = null;
    let raf = 0;
    let last = 0;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!field) field = createField(width, height);
      else resizeField(field, width, height);

      if (reduceMotion) {
        // Settle a still composition, including one visible traversal.
        for (let i = 0; i < 40; i++) stepField(field, 0.05);
        draw(ctx, field, null);
      }
    };

    const frame = (time: number) => {
      raf = 0;
      if (!field || !visible) return;
      const dt = last ? (time - last) / 1000 : 0;
      last = time;
      stepField(field, dt);
      draw(ctx, field, pointer);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (reduceMotion || raf || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointer = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? { x, y } : null;
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    start();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let intersection: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      intersection = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) start();
        else stop();
      });
      intersection.observe(canvas);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="graph-field"
      className={className ?? 'absolute inset-0 h-full w-full pointer-events-none'}
    />
  );
}
