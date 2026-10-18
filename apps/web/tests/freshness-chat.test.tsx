import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { EvidenceSource, FreshnessSummary } from '@argon/agent';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { EvidenceCard } from '@/components/briefing/evidence-card';
import { decisionAge, decisionProvenance, sourceChipLabel } from '@/lib/briefing-sources';

const CHAT_URL = 'https://chat.synthetic-demo.example/archives/payments-eng/p1';

const sources: EvidenceSource[] = [
  { nodeId: 'CHAT-1', kind: 'chat', label: 'Chat thread #payments-eng (synthetic)', url: CHAT_URL, relatedTo: 'CHAT-1', synthetic: true },
  { nodeId: 'PR-039', kind: 'pull_request', label: 'PR #39', url: 'https://github.com/argon/synthetic-demo/pull/39', relatedTo: 'CHAT-1' },
  { nodeId: 'DEC-OLD', kind: 'commit', label: 'Backoff', url: 'https://github.com/argon/synthetic-demo/commit/0123456789ab', relatedTo: 'DEC-OLD' },
];

const freshness = (over: Partial<FreshnessSummary> = {}): FreshnessSummary => ({
  staleAfterDays: 180,
  citedWithKnownAge: 2,
  staleCited: 1,
  oldestCitedAgeDays: 400,
  message: '1 of 2 cited decisions have been in force for more than 180 days (oldest: 400 days). Check they still hold.',
  decisions: [
    { decisionId: 'DEC-OLD', ageDays: 400, stale: true },
    { decisionId: 'CHAT-1', ageDays: 20, stale: false },
  ],
  ...over,
});

const briefing = {
  summary: { overview: 'Retries are governed.', riskLevel: 'medium' as const, keyTakeaways: [{ claim: 'Two rules apply.', citedNodeIds: ['DEC-OLD', 'CHAT-1'] }] },
  blastRadius: { analysis: 'billing', affectedComponents: [] },
  keyOwners: [],
  constrainingDecisions: [
    { decisionId: 'DEC-OLD', title: 'Exponential backoff', component: 'billing', status: 'active', constraint: 'No linear retries', citedNodeIds: ['DEC-OLD'] },
    { decisionId: 'CHAT-1', title: 'Retry budget agreed in chat', component: 'billing', status: 'accepted', constraint: 'At most 4 attempts', citedNodeIds: ['CHAT-1'] },
  ],
  precedents: [],
};

const response = (extra: Partial<WebBriefingResponse> = {}): WebBriefingResponse => ({
  status: 'SUCCESS',
  briefingId: 'b1',
  briefing,
  evidence: { verifiedNodeIds: ['DEC-OLD', 'CHAT-1'] },
  sources,
  freshness: freshness(),
  ...extra,
});

describe('stale badge on decision cards (5.4)', () => {
  it('renders for a stale decision with its age', () => {
    render(<EvidenceCard id="DEC-OLD" type="DECISION" title="Old" stale ageDays={400} staleAfterDays={180} />);
    const badge = screen.getByTestId('evidence-stale-badge');
    expect(badge).toHaveTextContent('Stale · 400d');
    expect(badge).toHaveAttribute('title', expect.stringContaining('400 days'));
  });

  it('does not render for a fresh decision, an undated one, or without freshness data', () => {
    const { rerender } = render(<EvidenceCard id="D" type="DECISION" title="t" stale={false} ageDays={20} />);
    expect(screen.queryByTestId('evidence-stale-badge')).not.toBeInTheDocument();
    rerender(<EvidenceCard id="D" type="DECISION" title="t" stale ageDays={null} />);
    expect(screen.queryByTestId('evidence-stale-badge')).not.toBeInTheDocument();
    rerender(<EvidenceCard id="D" type="DECISION" title="t" />);
    expect(screen.queryByTestId('evidence-stale-badge')).not.toBeInTheDocument();
  });
});

describe('freshness in the briefing view (5.4)', () => {
  it('shows the one-line summary and flags only the stale decision card', () => {
    render(<BriefingView response={response()} />);
    const note = screen.getByTestId('freshness-note');
    expect(note).toHaveTextContent('1 of 2 cited decisions have been in force for more than 180 days');
    expect(note).toHaveAttribute('data-stale', 'true');

    expect(within(screen.getByTestId('evidence-card-DEC-OLD')).getByTestId('evidence-stale-badge')).toHaveTextContent('400d');
    expect(within(screen.getByTestId('evidence-card-CHAT-1')).queryByTestId('evidence-stale-badge')).not.toBeInTheDocument();
  });

  it('a fully fresh briefing has a calm note and no badges', () => {
    render(
      <BriefingView
        response={response({
          freshness: freshness({
            staleCited: 0,
            oldestCitedAgeDays: 20,
            message: 'All 2 cited decisions are recent (in force for 180 days or less).',
            decisions: [{ decisionId: 'DEC-OLD', ageDays: 20, stale: false }, { decisionId: 'CHAT-1', ageDays: 5, stale: false }],
          }),
        })}
      />
    );
    expect(screen.getByTestId('freshness-note')).toHaveAttribute('data-stale', 'false');
    expect(screen.queryByTestId('evidence-stale-badge')).not.toBeInTheDocument();
  });

  it('is backward compatible: no freshness in the response renders no note and no badge', () => {
    render(<BriefingView response={response({ freshness: undefined })} />);
    expect(screen.getByTestId('briefing-view')).toBeInTheDocument();
    expect(screen.queryByTestId('freshness-note')).not.toBeInTheDocument();
    expect(screen.queryByTestId('evidence-stale-badge')).not.toBeInTheDocument();
  });

  it('shows no note when no cited decision has a known age', () => {
    render(<BriefingView response={response({ freshness: freshness({ citedWithKnownAge: 0, staleCited: 0, message: 'unknown', decisions: [] }) })} />);
    expect(screen.queryByTestId('freshness-note')).not.toBeInTheDocument();
  });

  it('decisionAge looks decisions up by id (with or without a leading #)', () => {
    expect(decisionAge(freshness(), '#DEC-OLD')).toEqual({ ageDays: 400, stale: true });
    expect(decisionAge(freshness(), 'CHAT-1')).toEqual({ ageDays: 20, stale: false });
    expect(decisionAge(freshness(), 'nope')).toBeUndefined();
    expect(decisionAge(null, 'DEC-OLD')).toBeUndefined();
  });
});

describe('synthetic chat source (5.3)', () => {
  it('labels the source link of a chat decision as a synthetic chat thread, not a document', () => {
    render(<BriefingView response={response()} />);
    const card = screen.getByTestId('evidence-card-CHAT-1');
    const link = within(card).getByTestId('evidence-source-link');
    expect(link).toHaveAttribute('href', CHAT_URL);
    expect(link).toHaveAttribute('data-synthetic', 'true');
    expect(link).toHaveTextContent('Chat thread #payments-eng (synthetic)');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // the PR the thread was about is linked as provenance
    expect(within(card).getByTestId('evidence-link-pull_request')).toHaveAttribute('href', 'https://github.com/argon/synthetic-demo/pull/39');
  });

  it('keeps the plain "Source Provenance" wording for non-chat decisions', () => {
    render(<BriefingView response={response()} />);
    const link = within(screen.getByTestId('evidence-card-DEC-OLD')).getByTestId('evidence-source-link');
    expect(link).toHaveTextContent('Source Provenance');
    expect(link).not.toHaveAttribute('data-synthetic');
  });

  it('decisionProvenance treats the chat thread as the decision origin, and chip labels say synthetic', () => {
    expect(decisionProvenance(sources, 'CHAT-1').origin?.kind).toBe('chat');
    expect(decisionProvenance(sources, 'CHAT-1').links.map((l) => l.kind)).toEqual(['pull_request']);
    expect(sourceChipLabel(sources[0]!)).toBe('Chat (synthetic)');
    expect(sourceChipLabel({ ...sources[0]!, synthetic: undefined })).toBe('Chat');
  });

  it('never renders a non-http(s) chat link', () => {
    render(
      <BriefingView
        response={response({ sources: [{ ...sources[0]!, url: 'javascript:alert(1)' }] })}
      />
    );
    const card = screen.getByTestId('evidence-card-CHAT-1');
    expect(within(card).queryByTestId('evidence-source-link')).not.toBeInTheDocument();
    expect(card.innerHTML).not.toContain('javascript:');
  });
});
