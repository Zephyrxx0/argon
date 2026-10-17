import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  describe('Overview / Files toggle', () => {
    const fileElements = {
      nodes: [
        { data: { id: 'src/a.ts', label: 'src/a.ts', type: 'File', properties: { path: 'src/a.ts', component: 'src', touches: 4 } } },
        { data: { id: 'src/b.ts', label: 'src/b.ts', type: 'File', properties: { path: 'src/b.ts', component: 'src', touches: 3 } } },
      ],
      edges: [
        { data: { id: 'co:src/a.ts->src/b.ts', source: 'src/a.ts', target: 'src/b.ts', label: 'CO_CHANGES', properties: { weight: 0.5, count: 6 } } },
      ],
    };

    it('does not render the toggle unless a view handler is given', () => {
      render(<GraphCanvas elements={elements} />);
      expect(screen.queryByTestId('hud-view-toggle')).not.toBeInTheDocument();
    });

    it('shows the current view as pressed and reports the other one when clicked', async () => {
      const onViewChange = vi.fn();
      render(<GraphCanvas elements={elements} view="overview" onViewChange={onViewChange} />);
      expect(screen.getByTestId('hud-view-overview')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('hud-view-files')).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(screen.getByTestId('hud-view-overview')); // already active: no-op
      expect(onViewChange).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('hud-view-files'));
      expect(onViewChange).toHaveBeenCalledWith('files');
    });

    it('renders file nodes and the legend note', async () => {
      render(<GraphCanvas elements={fileElements} view="files" onViewChange={() => {}} viewNote="Edges = files changed together" />);
      expect(await screen.findByText('a.ts')).toBeInTheDocument();
      expect(screen.getByText('b.ts')).toBeInTheDocument();
      expect(screen.getByTestId('legend-file')).toBeInTheDocument();
      expect(screen.getByTestId('graph-legend-note')).toHaveTextContent('Edges = files changed together');
    });

    it('clears the inspector and legend filters when the view changes', async () => {
      const { rerender } = render(<GraphCanvas elements={elements} view="overview" onViewChange={() => {}} />);
      fireEvent.click(await screen.findByText('Alice'));
      expect(await screen.findByTestId('node-inspector-popover')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('legend-person'));
      expect(screen.getByTestId('legend-person')).toHaveAttribute('aria-pressed', 'false');

      rerender(<GraphCanvas elements={fileElements} view="files" onViewChange={() => {}} />);
      expect(await screen.findByText('a.ts')).toBeInTheDocument();
      expect(screen.queryByTestId('node-inspector-popover')).not.toBeInTheDocument();

      rerender(<GraphCanvas elements={elements} view="overview" onViewChange={() => {}} />);
      expect(await screen.findByText('Alice')).toBeInTheDocument(); // person filter was reset
      expect(screen.getByTestId('legend-person')).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
