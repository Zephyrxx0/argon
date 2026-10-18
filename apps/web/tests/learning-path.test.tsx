import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { LearningPath } from '@argon/agent';
import { LearningPathView } from '@/components/briefing/learning-path';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { GraphSyncProvider, useGraphSync } from '@/lib/graph-sync';

const hop = (index: number, component: string, role: 'start' | 'step' | 'goal', extra: Record<string, unknown> = {}) => ({
  index, component, role, pageRank: null, decisions: [], owners: [], annotated: true, ...extra,
});

const path: LearningPath = {
  source: 'web-frontend',
  target: 'graph-client',
  found: true,
  length: 3,
  hops: [
    hop(0, 'web-frontend', 'start', { pageRank: 0.035, decisions: [{ id: 'CHAT-101', title: 'Never invent nodes', status: 'accepted' }] }),
    hop(1, 'citation-verifier', 'step', {
      pageRank: 0.049,
      decisions: [{ id: 'ADR-003', title: 'Fail-closed citation verification', status: 'active' }],
      owners: [{ id: 'P-3', name: 'Sam (Agent Engineer)', pattern: '/packages/agent/src/citations/' }],
    }),
    hop(2, 'query-engine', 'step'),
    hop(3, 'graph-client', 'goal', { annotated: false }),
  ],
};

const none: LearningPath = { source: 'billing', target: 'auth', found: false, length: 0, hops: [] };

function Probe() {
  const { focusRequest } = useGraphSync();
  return <span data-testid="probe">{focusRequest?.nodeId ?? 'none'}</span>;
}

describe('LearningPathView (5.5)', () => {
  it('renders N ordered hops, each with its annotations', () => {
    render(<LearningPathView paths={[path]} />);
    const hops = screen.getAllByTestId('learning-path-hop');
    expect(hops).toHaveLength(4);
    expect(hops.map((h) => h.getAttribute('data-index'))).toEqual(['0', '1', '2', '3']);
    expect(hops.map((h) => within(h).getByTestId('learning-path-component').textContent)).toEqual([
      'web-frontend', 'citation-verifier', 'query-engine', 'graph-client',
    ]);
    expect(hops.map((h) => h.getAttribute('data-role'))).toEqual(['start', 'step', 'step', 'goal']);
    expect(screen.getByText('Start here')).toBeInTheDocument();
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText(/3 hops/)).toBeInTheDocument();

    // annotations: decision and owner of record
    expect(within(hops[0]!).getByTestId('learning-path-decisions')).toHaveTextContent('#CHAT-101 Never invent nodes');
    expect(within(hops[0]!).getByTestId('learning-path-pagerank')).toHaveTextContent('PageRank 0.035');
    expect(within(hops[1]!).getByTestId('learning-path-decisions')).toHaveTextContent('#ADR-003');
    expect(within(hops[1]!).getByTestId('learning-path-owners')).toHaveTextContent('Sam (Agent Engineer)');
  });

  it('says what each step depends on, in order', () => {
    render(<LearningPathView paths={[path]} />);
    const list = screen.getByRole('list', { name: 'Learning path from web-frontend to graph-client' });
    const text = list.textContent!;
    expect(text.indexOf('web-frontend depends on')).toBeLessThan(text.indexOf('citation-verifier depends on'));
    expect(text).toContain('query-engine depends on');
  });

  it('is honest about hops it could not annotate and about components with nothing recorded', () => {
    render(<LearningPathView paths={[path]} />);
    const hops = screen.getAllByTestId('learning-path-hop');
    expect(within(hops[3]!).getByTestId('learning-path-unannotated')).toBeInTheDocument();
    expect(within(hops[2]!).getByText(/No decision or owner of record/)).toBeInTheDocument();
    expect(within(hops[1]!).queryByTestId('learning-path-unannotated')).not.toBeInTheDocument();
  });

  it('renders a graceful "no path" state for an empty walk', () => {
    render(<LearningPathView paths={[none]} />);
    expect(screen.queryAllByTestId('learning-path-hop')).toHaveLength(0);
    expect(screen.getByTestId('learning-path-empty')).toHaveTextContent('No dependency path from billing to auth');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('billing → auth');
  });

  it('renders nothing for no paths', () => {
    const { container } = render(<LearningPathView paths={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('"Show on graph" focuses the hop on the canvas (same focus mechanism as the citations)', () => {
    render(
      <GraphSyncProvider>
        <LearningPathView paths={[path]} />
        <Probe />
      </GraphSyncProvider>
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
    fireEvent.click(within(screen.getAllByTestId('learning-path-hop')[1]!).getByTestId('learning-path-focus'));
    expect(screen.getByTestId('probe')).toHaveTextContent('citation-verifier');
  });

  it('handles several paths, and a single-component walk', () => {
    const single: LearningPath = { source: 'a', target: 'a', found: true, length: 0, hops: [hop(0, 'a', 'start')] };
    render(<LearningPathView paths={[path, single, none]} />);
    expect(screen.getAllByTestId('learning-path-card')).toHaveLength(3);
    expect(screen.getByText('same component')).toBeInTheDocument();
    expect(screen.getByText('3 PATHS')).toBeInTheDocument();
  });
});

describe('BriefingView with learning paths (5.5)', () => {
  const base: WebBriefingResponse = {
    status: 'SUCCESS',
    briefing: {
      summary: { overview: 'o', riskLevel: 'low', keyTakeaways: [] },
      blastRadius: { analysis: 'a', affectedComponents: [] },
      keyOwners: [], constrainingDecisions: [], precedents: [],
    },
    evidence: { verifiedNodeIds: [] },
    toolTrace: [{ step: 1, source: 'llm', tool: 'path_between', args: {}, status: 'ok', rowCount: 1, evidenceIds: 0, durationMs: 1 }],
  };

  it('shows the learning path before the tool trace', () => {
    render(<BriefingView response={{ ...base, learningPaths: [path] }} />);
    const lp = screen.getByTestId('learning-path');
    const trace = screen.getByTestId('tool-trace');
    expect(lp.compareDocumentPosition(trace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lp).toHaveTextContent('06 // LEARNING PATH');
    expect(trace).toHaveTextContent('07 // GRAPH TOOLS CALLED');
  });

  it('is backward compatible: no learning paths renders no section', () => {
    render(<BriefingView response={base} />);
    expect(screen.queryByTestId('learning-path')).not.toBeInTheDocument();
    render(<BriefingView response={{ ...base, learningPaths: [] }} />);
    expect(screen.queryByTestId('learning-path')).not.toBeInTheDocument();
  });
});
