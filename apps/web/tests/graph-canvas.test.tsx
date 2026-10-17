import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GraphCanvas } from '@/components/graph/graph-canvas';

const elements = {
  nodes: [
    { data: { id: 'c:billing', label: 'billing', type: 'Component', properties: { reason: 'Retry loop' } } },
    {
      data: {
        id: 'd:2', label: 'DEC-002', type: 'Decision',
        properties: { title: 'A very long decision title that must be clamped inside its container', status: 'active' },
      },
    },
    { data: { id: 'p:alice', label: 'Alice', type: 'Person', properties: { role: 'author', commits: 12 } } },
  ],
  edges: [
    { data: { id: 'e1', source: 'd:2', target: 'c:billing', label: 'GOVERNS', properties: {} } },
    { data: { id: 'e2', source: 'p:alice', target: 'c:billing', label: 'OWNS', properties: {} } },
  ],
};

describe('GraphCanvas (React Flow)', () => {
  it('renders typed nodes with their content and the legend/toolbar', async () => {
    render(<GraphCanvas elements={elements} />);
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    expect(await screen.findByText('billing')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    // long title is present in full (clamped visually via CSS, full text via title attr)
    expect(
      screen.getByTitle('A very long decision title that must be clamped inside its container')
    ).toBeInTheDocument();
    expect(screen.getByTestId('graph-legend')).toBeInTheDocument();
    expect(screen.getByTestId('hud-controls')).toBeInTheDocument();
  });

  it('never invents a graph: with no elements it shows the given status instead', () => {
    const { rerender } = render(<GraphCanvas status={{ kind: 'loading' }} />);
    expect(screen.getByTestId('graph-loading')).toHaveTextContent('Reading graph');
    expect(screen.queryByText('BillingEngine')).not.toBeInTheDocument();

    rerender(<GraphCanvas status={{ kind: 'error', message: 'No graph, no answer' }} />);
    expect(screen.getByTestId('graph-error')).toHaveTextContent('No graph, no answer');

    rerender(<GraphCanvas status={{ kind: 'empty', message: 'No components indexed' }} />);
    expect(screen.getByTestId('graph-empty')).toHaveTextContent('No components indexed');
  });

  it('hides a node type from the legend and says so when everything is hidden', async () => {
    render(<GraphCanvas elements={{ nodes: [elements.nodes[2]!], edges: [] }} />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByTestId('legend-person'));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-empty')).toHaveTextContent(/all node types hidden/i);
    expect(screen.getByTestId('legend-person')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the inspector with the full properties when a node is clicked', async () => {
    render(<GraphCanvas elements={elements} />);
    fireEvent.click(await screen.findByText('Alice'));
    expect(await screen.findByTestId('node-inspector-popover')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-inspector-button'));
    expect(screen.queryByTestId('node-inspector-popover')).not.toBeInTheDocument();
  });
});
