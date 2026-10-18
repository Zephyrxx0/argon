import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Verdict } from '@argon/agent';
import { VerdictCard } from '@/components/briefing/verdict-card';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphSyncProvider, useGraphSync } from '@/lib/graph-sync';

const verdict: Verdict = {
  level: 'HOLD',
  summary: 'Hold: SUPERSEDED_PRECEDENT.',
  reasons: [
    { rule: 'REVERT_HISTORY', severity: 'review', detail: 'A revert touched these files.', citedNodeIds: ['PR-042'] },
    {
      rule: 'SUPERSEDED_PRECEDENT',
      severity: 'hold',
      detail: 'Matches a retired decision.',
      citedNodeIds: ['DEC-001', 'DEC-002'],
    },
    { rule: 'CENTRAL_COMPONENT', severity: 'review', detail: 'billing is central.', citedNodeIds: ['billing'] },
  ],
};

const elements = {
  nodes: [
    { data: { id: 'billing', label: 'billing', type: 'Component', properties: {} } },
    { data: { id: 'ledger', label: 'ledger', type: 'Component', properties: {} } },
    { data: { id: 'DEC-001', label: 'DEC-001', type: 'Decision', properties: { title: 'Linear retry', status: 'superseded' } } },
    { data: { id: 'DEC-002', label: 'DEC-002', type: 'Decision', properties: { title: 'Backoff', status: 'active' } } },
    { data: { id: 'Zed', label: 'Zed', type: 'Person', properties: {} } },
  ],
  edges: [
    { data: { id: 'g1', source: 'DEC-001', target: 'billing', label: 'GOVERNS', properties: {} } },
    { data: { id: 'g2', source: 'DEC-002', target: 'billing', label: 'GOVERNS', properties: {} } },
    { data: { id: 'o1', source: 'Zed', target: 'ledger', label: 'OWNS', properties: {} } },
  ],
};

function FocusProbe() {
  const { focusRequest, selectedNodeId, highlightedIds } = useGraphSync();
  return (
    <div>
      <span data-testid="probe-focus">{focusRequest ? JSON.stringify(focusRequest.nodeIds ?? [focusRequest.nodeId]) : 'none'}</span>
      <span data-testid="probe-selected">{selectedNodeId ?? 'none'}</span>
      <span data-testid="probe-highlighted">{highlightedIds.join(',') || 'none'}</span>
    </div>
  );
}

const visuals = () =>
  Object.fromEntries(
    Array.from(document.querySelectorAll('[data-kind]')).map((el) => [
      el.textContent?.match(/billing|ledger|DEC-001|DEC-002|Zed/)?.[0] ?? el.textContent,
      el.getAttribute('data-visual'),
    ])
  );

describe('VerdictCard -> canvas focus (5.2)', () => {
  it('clicking a cited node id focuses exactly that node (the citation-chip mechanism)', () => {
    render(
      <GraphSyncProvider>
        <VerdictCard verdict={verdict} />
        <FocusProbe />
      </GraphSyncProvider>
    );
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('none'); // mutation check: nothing before the click
    fireEvent.click(screen.getByRole('button', { name: 'DEC-002' }));
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('["DEC-002"]');
    expect(screen.getByTestId('probe-selected')).toHaveTextContent('DEC-002');
  });

  it('"Show on graph" focuses every node a reason cites, including ones beyond the visible chips', () => {
    const many: Verdict = {
      level: 'REVIEW',
      summary: 's',
      reasons: [{ rule: 'WIDE_BLAST_RADIUS', severity: 'review', detail: 'd', citedNodeIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }],
    };
    render(
      <GraphSyncProvider>
        <VerdictCard verdict={many} />
        <FocusProbe />
      </GraphSyncProvider>
    );
    expect(screen.getAllByTestId('verdict-node-chip')).toHaveLength(6);
    fireEvent.click(screen.getByTestId('verdict-reason-focus'));
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('["a","b","c","d","e","f","g","h"]');
    expect(screen.getByTestId('probe-highlighted')).toHaveTextContent('a,b,c,d,e,f,g,h');
  });

  it('is keyboard accessible: the controls are real buttons with accessible names', () => {
    render(<VerdictCard verdict={verdict} />);
    const btn = screen.getByRole('button', { name: /Highlight the 2 graph nodes behind SUPERSEDED_PRECEDENT/ });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('does nothing (and does not throw) outside a graph-sync provider', () => {
    render(<VerdictCard verdict={verdict} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'PR-042' }))).not.toThrow();
    expect(() => fireEvent.click(screen.getAllByTestId('verdict-reason-focus')[0]!)).not.toThrow();
  });

  it('lights up the cited nodes and dims the rest on the real canvas', async () => {
    render(
      <GraphSyncProvider>
        <VerdictCard verdict={verdict} />
        <FocusProbe />
        <div style={{ width: 800, height: 600 }}>
          <GraphCanvas elements={elements} />
        </div>
      </GraphSyncProvider>
    );
    await screen.findByText('ledger');
    expect(new Set(Object.values(visuals()))).toEqual(new Set(['idle'])); // nothing focused yet

    // SUPERSEDED_PRECEDENT cites DEC-001 + DEC-002 -> both, plus their neighbour `billing`, are active
    const reason = screen.getByText('SUPERSEDED_PRECEDENT').closest('li')!;
    fireEvent.click(within(reason).getByTestId('verdict-reason-focus'));
    await waitFor(() => {
      expect(visuals()).toMatchObject({ 'DEC-001': 'active', 'DEC-002': 'active', billing: 'active', ledger: 'dim', Zed: 'dim' });
    });
  });

  it('a reason whose ids are not on the canvas is a graceful no-op', async () => {
    render(
      <GraphSyncProvider>
        <VerdictCard verdict={verdict} />
        <FocusProbe />
        <div style={{ width: 800, height: 600 }}>
          <GraphCanvas elements={elements} />
        </div>
      </GraphSyncProvider>
    );
    await screen.findByText('ledger');
    // PR-042 is a revert commit: it is not drawn
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'PR-042' }))).not.toThrow();
    const reason = screen.getByText('REVERT_HISTORY').closest('li')!;
    expect(() => fireEvent.click(within(reason).getByTestId('verdict-reason-focus'))).not.toThrow();
    // the request was made, but nothing on the canvas changed
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('["PR-042"]');
    expect(new Set(Object.values(visuals()))).toEqual(new Set(['idle']));
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('partially drawn reasons still highlight what is drawn', async () => {
    const partial: Verdict = {
      level: 'REVIEW',
      summary: 's',
      reasons: [{ rule: 'MIXED', severity: 'review', detail: 'd', citedNodeIds: ['PR-042', 'ledger'] }],
    };
    render(
      <GraphSyncProvider>
        <VerdictCard verdict={partial} />
        <div style={{ width: 800, height: 600 }}>
          <GraphCanvas elements={elements} />
        </div>
      </GraphSyncProvider>
    );
    await waitFor(() => expect(document.querySelector('[data-kind="person"]')).not.toBeNull());
    fireEvent.click(screen.getByTestId('verdict-reason-focus'));
    await waitFor(() => expect(visuals()).toMatchObject({ ledger: 'active', Zed: 'active', billing: 'dim' }));
  });

  it('clicking the empty pane clears a multi-node highlight', async () => {
    render(
      <GraphSyncProvider>
        <VerdictCard verdict={verdict} />
        <FocusProbe />
        <div style={{ width: 800, height: 600 }}>
          <GraphCanvas elements={elements} />
        </div>
      </GraphSyncProvider>
    );
    await screen.findByText('ledger');
    const reason = screen.getByText('SUPERSEDED_PRECEDENT').closest('li')!;
    fireEvent.click(within(reason).getByTestId('verdict-reason-focus'));
    await waitFor(() => expect(visuals()).toMatchObject({ ledger: 'dim' }));
    fireEvent.click(document.querySelector('.react-flow__pane')!);
    await waitFor(() => expect(new Set(Object.values(visuals()))).toEqual(new Set(['idle'])));
    expect(screen.getByTestId('probe-highlighted')).toHaveTextContent('none');
  });
});
