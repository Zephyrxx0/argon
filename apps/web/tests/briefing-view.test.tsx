import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { KillSwitchCard } from '@/components/briefing/kill-switch-card';
import { StickyJumpBar } from '@/components/briefing/sticky-jump-bar';

describe('KillSwitchCard Component', () => {
  it('renders refusal copy conforming to UI-SPEC on citation failure', () => {
    const onRetryMock = vi.fn();
    render(
      <KillSwitchCard
        status="CITATION_INTEGRITY_FAILURE"
        onRetry={onRetryMock}
      />
    );

    expect(screen.getByText('CITATION_INTEGRITY_FAILURE')).toBeInTheDocument();
    expect(screen.getByText('No Graph, No Answer')).toBeInTheDocument();
    expect(
      screen.getByText(/Refusing to present briefing because 0 verified graph citations could be proven/i)
    ).toBeInTheDocument();

    const retryBtn = screen.getByTestId('kill-switch-retry-button');
    fireEvent.click(retryBtn);
    expect(onRetryMock).toHaveBeenCalledTimes(1);
  });

  it('renders FalkorDB unreachable 503 timeout copy', () => {
    render(<KillSwitchCard status="FALKORDB_TIMEOUT" />);

    expect(
      screen.getByText(/FalkorDB Graph Unreachable \(503\): Database connection timed out/i)
    ).toBeInTheDocument();
  });
});

describe('StickyJumpBar Component', () => {
  it('renders section pills and count badges', () => {
    render(
      <StickyJumpBar
        counts={{
          summary: 2,
          blastRadius: 4,
          keyOwners: 3,
          decisions: 1,
          precedents: 0,
        }}
      />
    );

    expect(screen.getByText('[SUMMARY]')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('[BLAST RADIUS]')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('[KEY OWNERS]')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('BriefingView Component', () => {
  const sampleSuccessResponse: WebBriefingResponse = {
    status: 'SUCCESS',
    briefingId: 'briefing_test_1',
    briefing: {
      summary: {
        overview: 'Overview of Billing Architecture',
        riskLevel: 'medium',
        keyTakeaways: [
          {
            claim: 'Refactor retry loop to exponential backoff',
            citedNodeIds: ['#d:14'],
          },
        ],
      },
      blastRadius: {
        analysis: 'High coupling across billing retry queues',
        affectedComponents: [
          {
            component: 'BillingEngine',
            reason: 'Direct file ownership',
            citedNodeIds: ['#c:BillingEngine'],
          },
        ],
      },
      keyOwners: [
        {
          personId: 'p:sarah-connor',
          name: 'Sarah Connor',
          role: 'author',
          component: 'BillingEngine',
          authoredCount: 142,
          reviewedCount: 38,
          citedNodeIds: ['#p:sarah-connor'],
        },
      ],
      constrainingDecisions: [
        {
          decisionId: 'd:14',
          title: 'RFC 014: Async Retry Pipeline',
          component: 'BillingEngine',
          status: 'ACTIVE',
          constraint: 'Mandates idempotency tokens on payment retries',
          citedNodeIds: ['#d:14'],
        },
      ],
      precedents: [
        {
          decisionId: 'd:08',
          title: 'RFC 008: Sync Billing',
          relevance: 'Deprecated in favor of RFC 014',
          citedNodeIds: ['#d:08'],
        },
      ],
    },
    evidence: {
      totalCitedCount: 4,
      verifiedCitationCount: 4,
    },
  };

  it('renders skeleton loading cards while loading', () => {
    render(<BriefingView response={null} isLoading={true} />);

    expect(screen.getByTestId('briefing-loading-skeleton')).toBeInTheDocument();
    expect(screen.getByText(/SYNTHESIZING FALKORDB TRAVERSALS\.\.\./i)).toBeInTheDocument();
  });

  it('renders KillSwitchCard on CITATION_INTEGRITY_FAILURE', () => {
    const failureResponse: WebBriefingResponse = {
      status: 'CITATION_INTEGRITY_FAILURE',
      reason: '0 verified citations found.',
      briefing: null,
      evidence: { totalCitedCount: 3, verifiedCitationCount: 0, strippedClaimCount: 3 },
    };

    render(<BriefingView response={failureResponse} />);

    expect(screen.getByTestId('kill-switch-card')).toBeInTheDocument();
    expect(screen.getByText('Dropped 3 uncited node claims')).toBeInTheDocument();
  });

  it('renders 5 structured sections with EvidenceCards on successful briefing', () => {
    render(<BriefingView response={sampleSuccessResponse} />);

    expect(screen.getByText('Overview of Billing Architecture')).toBeInTheDocument();
    expect(screen.getAllByText('BillingEngine').length).toBeGreaterThan(0);
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('RFC 014: Async Retry Pipeline')).toBeInTheDocument();
    expect(screen.getByText('RFC 008: Sync Billing')).toBeInTheDocument();
  });
});
