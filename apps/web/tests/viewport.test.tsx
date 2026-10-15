import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SplitViewport } from '@/components/layout/split-viewport';
import { get2077ThemeTokens } from '@/lib/theme';

describe('2077 Theme Extractor', () => {
  it('returns default 2077 theme tokens when executed in test environment', () => {
    const tokens = get2077ThemeTokens();
    expect(tokens.background).toBe('#090a0f');
    expect(tokens.accent).toBe('#00f0ff');
    expect(tokens.warning).toBe('#ffb800');
    expect(tokens.danger).toBe('#ff0055');
    expect(tokens.card).toBe('#0d1117');
    expect(tokens.nodeFile).toBe('#58a6ff');
    expect(tokens.nodePerson).toBe('#bc8cff');
  });
});

describe('SplitViewport Component', () => {
  const leftContent = <div data-testid="left-test-content">Briefing Stream Content</div>;
  const rightContent = <div data-testid="right-test-content">Cytoscape Canvas Content</div>;

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

    const toggleLeftBtn = screen.getByTestId('toggle-left-panel');
    const toggleRightBtn = screen.getByTestId('toggle-right-panel');

    expect(toggleLeftBtn).toBeInTheDocument();
    expect(toggleRightBtn).toBeInTheDocument();

    // Clicking toggle buttons should not throw
    expect(() => fireEvent.click(toggleLeftBtn)).not.toThrow();
    expect(() => fireEvent.click(toggleRightBtn)).not.toThrow();
  });
});
