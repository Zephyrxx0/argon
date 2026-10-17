import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { SplitViewport } from '@/components/layout/split-viewport';
import { getThemeTokens } from '@/lib/theme';

describe('Theme token extractor', () => {
  it('returns default theme tokens when executed in test environment', () => {
    const tokens = getThemeTokens();
    expect(tokens.background).toBe('#000000');
    expect(tokens.foreground).toBe('#ffffff');
    expect(tokens.accent).toBe('#ffffff');
    expect(tokens.accentForeground).toBe('#000000');
    // Chroma is reserved for state only
    expect(tokens.success).toBe('#3ddc84');
    expect(tokens.warning).toBe('#ffb020');
    expect(tokens.danger).toBe('#ff4d4d');
    // Node types are neutral greys/white
    for (const c of [tokens.nodeFile, tokens.nodePerson, tokens.nodeComponent, tokens.nodeDecision]) {
      const [r, g, b] = [c.slice(1, 3), c.slice(3, 5), c.slice(5, 7)];
      expect(r === g && g === b).toBe(true);
    }
  });
});

describe('SplitViewport Component', () => {
  const leftContent = <div data-testid="left-test-content">Briefing Stream Content</div>;
  const rightContent = <div data-testid="right-test-content">Graph Canvas Content</div>;

  it('renders left and right panel content', () => {
    render(<SplitViewport leftPanel={leftContent} rightPanel={rightContent} />);

    // Content should be in the document
    expect(screen.getAllByTestId('left-test-content').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('right-test-content').length).toBeGreaterThan(0);
  });

  it('renders mobile tab switchers and toggles visible panel container', () => {
    render(<SplitViewport leftPanel={leftContent} rightPanel={rightContent} />);

    const briefingTab = screen.getByTestId('tab-briefing');
    const canvasTab = screen.getByTestId('tab-canvas');
    const mobileBriefingContainer = screen.getByTestId('mobile-briefing-container');
    const mobileCanvasContainer = screen.getByTestId('mobile-canvas-container');

    // Default state: briefing tab is active
    expect(mobileBriefingContainer).toHaveClass('block');
    expect(mobileCanvasContainer).toHaveClass('hidden');

    // Click graph canvas tab
    fireEvent.click(canvasTab);
    expect(mobileBriefingContainer).toHaveClass('hidden');
    expect(mobileCanvasContainer).toHaveClass('block');

    // Click briefing tab back
    fireEvent.click(briefingTab);
    expect(mobileBriefingContainer).toHaveClass('block');
    expect(mobileCanvasContainer).toHaveClass('hidden');
  });

  it('renders resize handle and collapse control buttons', () => {
    render(<SplitViewport leftPanel={leftContent} rightPanel={rightContent} />);

    const resizeHandle = screen.getByTestId('viewport-resize-handle');
    expect(resizeHandle).toBeInTheDocument();

    // Collapse toggle buttons were removed; the handle only drag-resizes
    expect(screen.queryByTestId('toggle-left-panel')).toBeNull();
    expect(screen.queryByTestId('toggle-right-panel')).toBeNull();
  });
});

describe('SplitViewport mounts each panel once', () => {
  const left = <div data-testid="left-once">L</div>;
  const right = <div data-testid="right-once">R</div>;
  const original = window.matchMedia;

  const stubMatchMedia = (matches: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  };

  afterEach(() => {
    window.matchMedia = original;
  });

  it('desktop: content lives only in the resizable panels', () => {
    stubMatchMedia(true);
    render(<SplitViewport leftPanel={left} rightPanel={right} />);

    expect(screen.getAllByTestId('left-once')).toHaveLength(1);
    expect(screen.getAllByTestId('right-once')).toHaveLength(1);
    expect(screen.getByTestId('desktop-briefing-panel')).toContainElement(screen.getByTestId('left-once'));
    expect(screen.getByTestId('desktop-canvas-panel')).toContainElement(screen.getByTestId('right-once'));
    expect(screen.getByTestId('mobile-briefing-container')).toBeEmptyDOMElement();
  });

  it('mobile: content lives only in the tab containers', () => {
    stubMatchMedia(false);
    render(<SplitViewport leftPanel={left} rightPanel={right} />);

    expect(screen.getAllByTestId('left-once')).toHaveLength(1);
    expect(screen.getAllByTestId('right-once')).toHaveLength(1);
    expect(screen.getByTestId('mobile-briefing-container')).toContainElement(screen.getByTestId('left-once'));
    expect(screen.getByTestId('mobile-canvas-container')).toContainElement(screen.getByTestId('right-once'));
    expect(screen.getByTestId('desktop-briefing-panel')).not.toContainElement(screen.queryByTestId('left-once'));
  });
});
