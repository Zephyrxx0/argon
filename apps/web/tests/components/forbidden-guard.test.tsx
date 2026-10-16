import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BriefingView } from '@/components/briefing/briefing-view';
import { ForbiddenCard } from '@/components/briefing/forbidden-card';

describe('Forbidden Access View (403 & 404 Guards)', () => {
  it('renders high-visibility neon red card with exact 403 Forbidden copy from UI-SPEC', () => {
    const mockWorkspace = 'internal-core-infra';
    const mockOnSelectWorkspace = vi.fn();

    render(
      <BriefingView
        response={{
          status: 'FORBIDDEN',
          workspaceId: mockWorkspace,
          reason: `Workspace access denied: You do not have permissions for workspace '${mockWorkspace}'. Request access from the workspace owner or switch to a showcase workspace.`,
          briefing: null,
        }}
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    // Verify card rendered
    const card = screen.getByTestId('forbidden-access-card');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('border-[#ff0055]');
    expect(card.className).toContain('text-[#ff0055]');

    // Verify title copy
    const title = screen.getByTestId('forbidden-title');
    expect(title).toHaveTextContent('ARGON // 403 FORBIDDEN');

    // Verify body copy matching UI-SPEC §Copywriting Contract
    const body = screen.getByTestId('forbidden-body');
    expect(body).toHaveTextContent(
      `Workspace access denied: You do not have permissions for workspace '${mockWorkspace}'. Request access from the workspace owner or switch to a showcase workspace.`
    );

    // Verify CTA button copy
    const cta = screen.getByTestId('switch-to-showcase-btn');
    expect(cta).toHaveTextContent('Switch to Showcase');
  });

  it('invokes onSelectWorkspace with ember-adr-showcase when Switch to Showcase button is clicked', () => {
    const mockOnSelectWorkspace = vi.fn();

    render(
      <ForbiddenCard
        workspaceId="restricted-payments-repo"
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    const cta = screen.getByTestId('switch-to-showcase-btn');
    fireEvent.click(cta);

    expect(mockOnSelectWorkspace).toHaveBeenCalledTimes(1);
    expect(mockOnSelectWorkspace).toHaveBeenCalledWith('ember-adr-showcase');
  });

  it('renders 404 Not Found warning banner when workspace does not exist', () => {
    render(
      <BriefingView
        response={{
          status: 'NOT_FOUND',
          workspaceId: 'ghost-workspace',
          reason: "Workspace 'ghost-workspace' not found.",
          briefing: null,
        }}
      />
    );

    expect(screen.getByTestId('not-found-banner')).toBeInTheDocument();
    expect(screen.getByTestId('not-found-body')).toHaveTextContent(
      "Workspace 'ghost-workspace' not found."
    );
  });
});
