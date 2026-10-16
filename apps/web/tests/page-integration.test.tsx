import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomePage from '@/app/page';
import { AuthProvider } from '@/app/providers';

describe('Argon Web App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/briefing')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'SUCCESS',
              briefingId: 'b_mock_1',
              briefing: {
                summary: {
                  overview: 'Mock Architecture Briefing for Billing',
                  riskLevel: 'medium',
                  keyTakeaways: [
                    {
                      claim: 'Retry loops must be exponential',
                      citedNodeIds: ['#d:RFC-014'],
                    },
                  ],
                },
                blastRadius: {
                  analysis: 'Coupling across billing retry and queues',
                  affectedComponents: [
                    {
                      component: 'BillingEngine',
                      reason: 'Contains primary retry handler',
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
                    authoredCount: 342,
                    reviewedCount: 89,
                    citedNodeIds: ['#p:sarah-connor'],
                  },
                ],
                constrainingDecisions: [
                  {
                    decisionId: 'd:RFC-014',
                    title: 'RFC-014: Async Retry Pipeline',
                    component: 'BillingEngine',
                    status: 'ACTIVE',
                    constraint: 'Mandates idempotency tokens on payment retries',
                    citedNodeIds: ['#d:RFC-014'],
                  },
                ],
                precedents: [],
              },
              evidence: { totalCitedCount: 3, verifiedCitationCount: 3 },
            }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  it('renders initial landing state with HeaderBar, ShowcaseHub, and Cytoscape container', () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>
    );

    // Header bar elements
    expect(screen.getByText(/ARGON \/\/ 2077/i)).toBeInTheDocument();
    expect(screen.getByTestId('command-bar-input')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('contributor-picker-trigger')).toBeInTheDocument();

    // Showcase Hub landing content (rendered in responsive dual containers)
    expect(screen.getAllByText('No Architectural Briefing Generated').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('scenario-card-s1-blast-radius').length).toBeGreaterThan(0);

    // Cytoscape Canvas & HUD Controls (rendered in responsive dual containers)
    expect(screen.getAllByTestId('cytoscape-container').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('hud-controls').length).toBeGreaterThan(0);
  });

  it('triggers briefing pipeline when scenario is selected and renders BriefingView', async () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>
    );

    const scenarioCard = screen.getAllByTestId('scenario-card-s1-blast-radius')[0];
    fireEvent.click(scenarioCard);

    // Wait for briefing view to render in the document
    await waitFor(() => {
      expect(screen.getAllByText('Mock Architecture Briefing for Billing').length).toBeGreaterThan(0);
    });

    // Evidence cards should be present across briefing sections
    expect(screen.getAllByText('BillingEngine').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sarah Connor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RFC-014: Async Retry Pipeline').length).toBeGreaterThan(0);
  });
});

