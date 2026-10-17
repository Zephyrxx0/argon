import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkspacePage from '@/app/workspace/page';
import { AuthProvider } from '@/app/providers';

describe('Argon Web App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/overview')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              workspaceId: 'ember-adr-showcase',
              elements: {
                nodes: [{ data: { id: 'routing', label: 'routing', type: 'Component', properties: { files: 3 } } }],
                edges: [],
              },
              stats: { components: 1, files: 3, decisions: 0, people: 0, truncated: false },
              topFiles: [{ path: 'packages/routing/router.ts', component: 'routing', touches: 5 }],
            }),
        });
      }
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

  it('renders initial landing state with HeaderBar, ShowcaseHub, and graph canvas', async () => {
    render(
      <AuthProvider>
        <WorkspacePage />
      </AuthProvider>
    );

    // Header bar elements
    expect(screen.getByRole('link', { name: /argon home/i })).toHaveAttribute('href', '/');
    expect(screen.getByTestId('command-bar-input')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('contributor-picker-trigger')).toBeInTheDocument();

    // Showcase Hub landing content (rendered in responsive dual containers)
    expect(screen.getAllByText('No Architectural Briefing Generated').length).toBeGreaterThan(0);
    // scenario cards are derived from the workspace's own graph once it has loaded
    expect((await screen.findAllByTestId('scenario-card-s1-blast-radius')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Refactor `packages\/routing\/router\.ts`/).length).toBeGreaterThan(0);

    // Graph canvas & HUD controls (rendered in responsive dual containers)
    expect(screen.getAllByTestId('graph-canvas').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('hud-controls').length).toBeGreaterThan(0);
  });

  it('triggers briefing pipeline when scenario is selected and renders BriefingView', async () => {
    render(
      <AuthProvider>
        <WorkspacePage />
      </AuthProvider>
    );

    const scenarioCard = (await screen.findAllByTestId('scenario-card-s1-blast-radius'))[0]!;
    fireEvent.click(scenarioCard);

    // Wait for briefing view to render in the document
    await waitFor(
      () => {
        expect(screen.getAllByText('Mock Architecture Briefing for Billing').length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    // Evidence cards should be present across briefing sections
    expect(screen.getAllByText('BillingEngine').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sarah Connor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RFC-014: Async Retry Pipeline').length).toBeGreaterThan(0);
  });
});

