import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EvidenceCard } from '@/components/briefing/evidence-card';
import { GraphSyncProvider, useGraphSync } from '@/lib/graph-sync';

// Test consumer to inspect GraphSyncContext state changes
function SyncInspector() {
  const { hoveredNodeId, selectedNodeId, focusRequest } = useGraphSync();
  return (
    <div data-testid="sync-inspector">
      <span data-testid="hovered-id">{hoveredNodeId ?? 'none'}</span>
      <span data-testid="selected-id">{selectedNodeId ?? 'none'}</span>
      <span data-testid="focus-node-id">{focusRequest?.nodeId ?? 'none'}</span>
    </div>
  );
}

describe('EvidenceCard Component', () => {
  it('renders type badge, node ID, and title', () => {
    render(
      <EvidenceCard
        id="d:14"
        type="DECISION"
        title="RFC 014: Asynchronous Retry Strategy"
        description="Governing decision for billing retry queues"
      />
    );

    expect(screen.getByText('DECISION')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-node-id')).toHaveTextContent('#d:14');
    expect(screen.getByText('RFC 014: Asynchronous Retry Strategy')).toBeInTheDocument();
    expect(screen.getByText('VALID IN FORCE')).toBeInTheDocument();
  });

  it('renders superseded badge with superseding pointer', () => {
    render(
      <EvidenceCard
        id="d:08"
        type="DECISION"
        title="RFC 008: Synchronous Blockers"
        validity="SUPERSEDED"
        supersededBy="d:14"
      />
    );

    expect(screen.getByTestId('evidence-superseded-badge')).toBeInTheDocument();
    expect(screen.getByText('SUPERSEDED')).toBeInTheDocument();
    expect(screen.getByText('#d:14')).toBeInTheDocument();
  });

  it('dispatches focusNode and hover events to GraphSyncContext', () => {
    render(
      <GraphSyncProvider>
        <SyncInspector />
        <EvidenceCard
          id="c:BillingEngine"
          type="COMPONENT"
          title="Billing Engine Subsystem"
        />
      </GraphSyncProvider>
    );

    const card = screen.getByTestId('evidence-card-c:BillingEngine');
    const focusBtn = screen.getByTestId('focus-in-graph-button');

    // Hover card
    fireEvent.mouseEnter(card);
    expect(screen.getByTestId('hovered-id')).toHaveTextContent('c:BillingEngine');

    // Unhover card
    fireEvent.mouseLeave(card);
    expect(screen.getByTestId('hovered-id')).toHaveTextContent('none');

    // Click focus in graph button
    fireEvent.click(focusBtn);
    expect(screen.getByTestId('selected-id')).toHaveTextContent('c:BillingEngine');
    expect(screen.getByTestId('focus-node-id')).toHaveTextContent('c:BillingEngine');
  });
});
