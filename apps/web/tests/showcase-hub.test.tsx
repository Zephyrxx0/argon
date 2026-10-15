import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowcaseHub, SCENARIO_PRESETS } from '@/components/hub/showcase-hub';

describe('ShowcaseHub Component', () => {
  it('renders the empty state heading and guidance copywriting conforming to UI-SPEC', () => {
    render(<ShowcaseHub />);

    expect(screen.getByText('No Architectural Briefing Generated')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Enter a target file path, component name, or task in the command bar above, or select a showcase scenario/i
      )
    ).toBeInTheDocument();
  });

  it('renders 3 curated scenario cards with correct badges and queries', () => {
    render(<ShowcaseHub />);

    expect(SCENARIO_PRESETS).toHaveLength(3);

    // Scenario 1
    expect(screen.getByText(/Refactor `billing\/retry\.ts`/i)).toBeInTheDocument();
    expect(screen.getByText('BLAST RADIUS & OWNERS')).toBeInTheDocument();

    // Scenario 2
    expect(screen.getAllByText(/I want to work on the auth layer/i).length).toBeGreaterThan(0);
    expect(screen.getByText('ONBOARDING PATH')).toBeInTheDocument();

    // Scenario 3
    expect(screen.getByText(/Why does `legacy-sync` exist\?/i)).toBeInTheDocument();
    expect(screen.getByText('ARCHITECTURAL PRECEDENT')).toBeInTheDocument();
  });

  it('fires onSelectScenario callback when a scenario card is clicked', () => {
    const onSelectMock = vi.fn();
    render(<ShowcaseHub onSelectScenario={onSelectMock} />);

    const scenarioCard = screen.getByTestId('scenario-card-s1-blast-radius');
    fireEvent.click(scenarioCard);

    expect(onSelectMock).toHaveBeenCalledWith('Refactor billing/retry.ts', 's1-blast-radius');
  });
});
