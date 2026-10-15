import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startMarchingAnimation } from '@/components/canvas/traversal-animator';

describe('Traversal Marching Animator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds marching-edge class to target edges and stops cleanly', () => {
    const mockEdges = {
      addClass: vi.fn(),
      removeClass: vi.fn(),
      removeStyle: vi.fn(),
      style: vi.fn(),
      length: 2,
    };

    const mockCy = {
      edges: vi.fn().mockReturnValue(mockEdges),
    };

    const handle = startMarchingAnimation(mockCy);

    expect(mockEdges.addClass).toHaveBeenCalledWith('marching-edge');

    // Clean up
    handle.stop();
    expect(mockEdges.removeClass).toHaveBeenCalledWith('marching-edge');
  });

  it('handles empty edge selection safely without error', () => {
    const mockCy = {
      edges: vi.fn().mockReturnValue({ length: 0 }),
    };

    const handle = startMarchingAnimation(mockCy);
    expect(() => handle.stop()).not.toThrow();
  });
});
