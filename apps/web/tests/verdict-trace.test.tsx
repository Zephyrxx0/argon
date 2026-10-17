import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { VerdictCard } from '@/components/briefing/verdict-card';
import { ToolTracePanel } from '@/components/briefing/tool-trace';
import type { ToolTraceEntry, Verdict } from '@argon/agent';

const holdVerdict: Verdict = {
  level: 'HOLD',
  summary: 'Hold and consult owners first: SUPERSEDED_PRECEDENT.',
  reasons: [
    {
      rule: 'REVERT_HISTORY',
      severity: 'review',
      detail: '1 revert commit(s) previously touched these files.',
      citedNodeIds: ['PR-042'],
    },
    {
      rule: 'SUPERSEDED_PRECEDENT',
      severity: 'hold',
      detail: 'The task closely matches superseded decision(s) DEC-001.',
      citedNodeIds: ['DEC-001', 'a', 'b', 'c', 'd', 'e', 'f'],
    },
    { rule: 'DECISIONS_IN_FORCE', severity: 'info', detail: '1 decision in force.', citedNodeIds: ['DEC-002'] },
  ],
};

const trace: ToolTraceEntry[] = [
  { step: 0, source: 'pipeline', tool: 'blast_radius', args: { files: ['billing/retry.ts'], maxDepth: 3 }, status: 'ok', rowCount: 4, evidenceIds: 3, durationMs: 12 },
  { step: 0, source: 'pipeline', tool: 'precedent_search', args: { queryVector: '<512-d vector>', limit: 5 }, status: 'skipped', rowCount: 0, evidenceIds: 0, durationMs: 0, note: 'no query embedding available' },
  { step: 1, source: 'llm', tool: 'path_between', args: { sourceName: 'billing', targetName: 'ledger' }, status: 'ok', rowCount: 1, evidenceIds: 2, durationMs: 31 },
  { step: 1, source: 'llm', tool: 'run_cypher', args: {}, status: 'rejected', rowCount: 0, evidenceIds: 0, durationMs: 0, note: 'Tool is not in the allowed catalog' },
];

const briefing = {
  summary: { overview: 'Billing retry overview', riskLevel: 'high' as const, keyTakeaways: [{ claim: 'Use backoff', citedNodeIds: ['DEC-002'] }] },
  blastRadius: { analysis: 'Billing feeds ledger', affectedComponents: [] },
  keyOwners: [],
  constrainingDecisions: [],
  precedents: [],
};

const success = (extra: Partial<WebBriefingResponse> = {}): WebBriefingResponse => ({
  status: 'SUCCESS',
  briefingId: 'b1',
  briefing,
  evidence: { verifiedNodeIds: ['DEC-002'] },
  ...extra,
});

describe('VerdictCard', () => {
  it.each([
    ['PROCEED', 'Proceed'],
    ['REVIEW', 'Review first'],
    ['HOLD', 'Hold'],
  ] as const)('renders the %s level with its label', (level, label) => {
    render(<VerdictCard verdict={{ level, summary: 's', reasons: [] }} />);
    const card = screen.getByTestId('verdict-card');
    expect(card).toHaveAttribute('data-verdict', level);
    expect(screen.getByTestId('verdict-level')).toHaveTextContent(level);
    expect(card).toHaveTextContent(label);
    expect(screen.queryByTestId('verdict-reasons')).not.toBeInTheDocument();
  });

  it('lists each rule with its explanation and the graph nodes it rests on (truncated)', () => {
    render(<VerdictCard verdict={holdVerdict} />);
    const list = screen.getByTestId('verdict-reasons');
    expect(within(list).getByText('REVERT_HISTORY')).toBeInTheDocument();
    expect(within(list).getByText(/previously touched these files/)).toBeInTheDocument();
    expect(within(list).getByText(/graph nodes: PR-042/)).toBeInTheDocument();
    expect(within(list).getByText(/\+1 more/)).toBeInTheDocument();
    expect(screen.getByText(/Computed from the graph, not generated/)).toBeInTheDocument();
    expect(screen.getByLabelText('Graph verdict: HOLD')).toBeInTheDocument();
  });
});

describe('ToolTracePanel', () => {
  it('shows every call with who chose it, its status and result size', () => {
    render(<ToolTracePanel trace={trace} selection={{ status: 'completed', steps: 2, llmCallCount: 1 }} />);
    const rows = screen.getAllByTestId('tool-trace-row');
    expect(rows).toHaveLength(4);
    expect(screen.getByTestId('tool-trace-counts')).toHaveTextContent('1 PIPELINE · 1 LLM-SELECTED');

    expect(rows[0]).toHaveAttribute('data-source', 'pipeline');
    expect(rows[0]).toHaveTextContent('blast_radius');
    expect(rows[0]).toHaveTextContent('4 rows');
    expect(rows[0]).toHaveTextContent('12ms');

    expect(rows[1]).toHaveAttribute('data-status', 'skipped');
    expect(rows[1]).toHaveTextContent('no query embedding available');
    expect(rows[1]).toHaveTextContent('<512-d vector>');

    expect(rows[2]).toHaveAttribute('data-source', 'llm');
    expect(rows[2]).toHaveTextContent('LLM step 1');
    expect(rows[2]).toHaveTextContent('sourceName=billing');

    expect(rows[3]).toHaveAttribute('data-status', 'rejected');
    expect(rows[3]).toHaveTextContent('Tool is not in the allowed catalog');
    expect(screen.getByTestId('tool-selection-status')).toHaveTextContent('LLM tool selection: completed');
  });

  it('explains why tool selection did not run or failed', () => {
    const { rerender } = render(
      <ToolTracePanel trace={trace} selection={{ status: 'skipped', reason: 'no model API key configured', steps: 0, llmCallCount: 0 }} />
    );
    expect(screen.getByTestId('tool-selection-status')).toHaveTextContent('skipped (no model API key configured)');
    rerender(
      <ToolTracePanel trace={trace} selection={{ status: 'failed', reason: 'Tool selection timed out after 25000ms', steps: 2, llmCallCount: 0 }} />
    );
    expect(screen.getByTestId('tool-selection-status')).toHaveTextContent('timed out');
  });

  it('renders an empty state', () => {
    render(<ToolTracePanel trace={[]} />);
    expect(screen.getByText('No tool calls recorded')).toBeInTheDocument();
  });
});

describe('BriefingView with verdict and tool trace', () => {
  it('shows the verdict above the summary and the tool trace after the evidence sections', () => {
    render(<BriefingView response={success({ verdict: holdVerdict, toolTrace: trace, toolSelection: { status: 'completed', steps: 2, llmCallCount: 1 } })} />);
    const view = screen.getByTestId('briefing-view');
    const verdictCard = screen.getByTestId('verdict-card');
    const summary = view.querySelector('#sec-summary')!;
    const traceSection = screen.getByTestId('tool-trace');
    expect(verdictCard.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.compareDocumentPosition(traceSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId('tool-trace-row')).toHaveLength(4);
  });

  it('is backward compatible: no verdict or trace in the response renders neither', () => {
    render(<BriefingView response={success()} />);
    expect(screen.getByTestId('briefing-view')).toBeInTheDocument();
    expect(screen.queryByTestId('verdict-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-trace')).not.toBeInTheDocument();
  });

  it('never shows a verdict on a refusal (no graph, no answer)', () => {
    render(
      <BriefingView
        response={{ status: 'NO_GRAPH_DATA', reason: 'nothing', briefing: null, verdict: holdVerdict, toolTrace: trace }}
      />
    );
    expect(screen.queryByTestId('verdict-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-trace')).not.toBeInTheDocument();
  });
});
