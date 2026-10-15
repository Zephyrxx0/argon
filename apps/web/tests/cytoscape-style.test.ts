import { describe, it, expect } from 'vitest';
import { createCytoscapeStylesheet } from '@/components/canvas/stylesheet';
import { DEFAULT_2077_THEME } from '@/lib/theme';

describe('Cytoscape Stylesheet', () => {
  it('generates stylesheet rules conforming to 2077 cyberpunk design tokens', () => {
    const stylesheet = createCytoscapeStylesheet(DEFAULT_2077_THEME);

    expect(stylesheet.length).toBeGreaterThan(5);

    // Default node
    const nodeRule = stylesheet.find((r) => r.selector === 'node');
    expect(nodeRule).toBeDefined();
    expect(nodeRule?.style['background-color']).toBe('#0d1117');

    // Decision node: diamond & warning gold #ffb800
    const decisionRule = stylesheet.find((r) => r.selector.includes('Decision'));
    expect(decisionRule).toBeDefined();
    expect(decisionRule?.style['shape']).toBe('diamond');
    expect(decisionRule?.style['border-color']).toBe('#ffb800');

    // Superseded decision: dashed border & red #ff0055
    const supersededRule = stylesheet.find((r) => r.selector.includes('superseded'));
    expect(supersededRule).toBeDefined();
    expect(supersededRule?.style['border-color']).toBe('#ff0055');

    // Component node: round-rectangle & cyan #00f0ff
    const componentRule = stylesheet.find((r) => r.selector.includes('Component'));
    expect(componentRule).toBeDefined();
    expect(componentRule?.style['shape']).toBe('round-rectangle');
    expect(componentRule?.style['border-color']).toBe('#00f0ff');

    // File node: rectangle & blue #58a6ff
    const fileRule = stylesheet.find((r) => r.selector.includes('File'));
    expect(fileRule).toBeDefined();
    expect(fileRule?.style['shape']).toBe('rectangle');
    expect(fileRule?.style['border-color']).toBe('#58a6ff');

    // Person node: ellipse & purple #bc8cff
    const personRule = stylesheet.find((r) => r.selector.includes('Person'));
    expect(personRule).toBeDefined();
    expect(personRule?.style['shape']).toBe('ellipse');
    expect(personRule?.style['border-color']).toBe('#bc8cff');

    // Highlighting rules
    const highlightRule = stylesheet.find((r) => r.selector === 'node.highlighted');
    expect(highlightRule?.style['border-color']).toBe('#00f0ff');

    const dimmedRule = stylesheet.find((r) => r.selector === 'node.dimmed');
    expect(dimmedRule?.style['opacity']).toBe(0.2);
  });
});

