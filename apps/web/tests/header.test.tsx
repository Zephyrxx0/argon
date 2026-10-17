import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContributorPicker } from '@/components/contributor/contributor-picker';
import { HeaderBar } from '@/components/navigation/header-bar';
import { AuthProvider } from '@/app/providers';

const PEOPLE = [
  { id: 'sarah-connor', name: 'Sarah Connor', role: 'Top Contributor', commits: 342, lastActive: '2d ago' },
  { id: 'alex-chen', name: 'Alex Chen', role: 'Author', commits: 218, lastActive: '5d ago' },
];

describe('ContributorPicker Component', () => {
  it('renders default Guest unassigned state', () => {
    render(<ContributorPicker currentContributorId={null} onSelectContributor={vi.fn()} />);

    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('renders selected contributor identity pill', () => {
    render(
      <ContributorPicker
        contributors={PEOPLE}
        currentContributorId="sarah-connor"
        onSelectContributor={vi.fn()}
      />
    );

    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('Top')).toBeInTheDocument();
  });

  it('opens combobox dropdown and selects a contributor', () => {
    const onSelectMock = vi.fn();
    render(
      <ContributorPicker
        contributors={PEOPLE}
        currentContributorId={null}
        onSelectContributor={onSelectMock}
      />
    );

    fireEvent.click(screen.getByTestId('contributor-picker-trigger'));
    expect(screen.getByTestId('contributor-dropdown')).toBeInTheDocument();

    const alexItem = screen.getByTestId('contributor-item-alex-chen');
    fireEvent.click(alexItem);

    expect(onSelectMock).toHaveBeenCalledWith('alex-chen');
  });

  it('resets identity to Guest when reset button is clicked', () => {
    const onSelectMock = vi.fn();
    render(
      <ContributorPicker
        contributors={PEOPLE}
        currentContributorId="sarah-connor"
        onSelectContributor={onSelectMock}
      />
    );

    fireEvent.click(screen.getByTestId('contributor-picker-trigger'));
    const clearBtn = screen.getByTestId('clear-contributor-button');
    fireEvent.click(clearBtn);

    expect(onSelectMock).toHaveBeenCalledWith(null);
  });
});

describe('HeaderBar Component', () => {
  it('renders logo, command bar, workspace switcher, and contributor picker', () => {
    const onSubmitMock = vi.fn();
    const onWorkspaceMock = vi.fn();
    const onContributorMock = vi.fn();

    render(
      <AuthProvider>
        <HeaderBar
          currentQuery="billing/retry.ts"
          onSubmitQuery={onSubmitMock}
          onSelectWorkspace={onWorkspaceMock}
          onSelectContributor={onContributorMock}
        />
      </AuthProvider>
    );

    expect(screen.getByRole('link', { name: /argon home/i })).toHaveAttribute('href', '/');
    expect(screen.getByTestId('command-bar-input')).toHaveValue('billing/retry.ts');
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('contributor-picker-trigger')).toBeInTheDocument();
  });

  it('lays the header out as a 3-column grid with a fixed centre so the command bar does not shift (#8)', () => {
    const { container } = render(
      <AuthProvider>
        <HeaderBar onSubmitQuery={vi.fn()} onSelectWorkspace={vi.fn()} onSelectContributor={vi.fn()} />
      </AuthProvider>
    );
    const header = container.querySelector('header')!;
    // a grid with explicit 1fr / auto / 1fr columns keeps the centre put regardless of side widths
    expect(header.className).toContain('grid');
    expect(header.className).toContain('grid-cols-[1fr_auto_1fr]');
    // the command bar lives in a fixed-width (clamp) column, centred in the grid cell
    const center = screen.getByTestId('command-bar-input').closest('.justify-self-center');
    expect(center).not.toBeNull();
    expect(center!.className).toMatch(/w-\[clamp\(/);
  });
});
