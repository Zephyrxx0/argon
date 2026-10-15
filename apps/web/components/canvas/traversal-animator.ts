/**
 * Traversal Animator: animates edge dash offset along multi-hop traversal paths (Decision D-08).
 */

export interface AnimatorHandle {
  stop: () => void;
}

export function startMarchingAnimation(cy: any, edgeIds?: string[]): AnimatorHandle {
  if (!cy || typeof window === 'undefined') {
    return { stop: () => {} };
  }

  let rafId: number | null = null;
  let offset = 0;

  // Select target edges (either explicit IDs or all highlighted/active edges)
  const edges = edgeIds && edgeIds.length > 0
    ? cy.edges().filter((edge: any) => edgeIds.includes(edge.id()))
    : cy.edges('.marching-edge, .highlighted');

  if (edges.length === 0) {
    return { stop: () => {} };
  }

  edges.addClass('marching-edge');

  const step = () => {
    offset = (offset + 1) % 24;
    try {
      edges.style('line-dash-offset', -offset);
    } catch {
      // Element may be removed
    }
    rafId = window.requestAnimationFrame(step);
  };

  rafId = window.requestAnimationFrame(step);

  return {
    stop: () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      try {
        edges.removeClass('marching-edge');
        edges.removeStyle('line-dash-offset');
      } catch {
        // Cleanup safety
      }
    },
  };
}

