import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContributorPicker } from '@/components/contributor/contributor-picker';
import { HeaderBar } from '@/components/navigation/header-bar';

describe('ContributorPicker Component', () => {
  it('renders default Guest unassigned state', () => {
    render(<ContributorPicker currentContributorId={null} onSelectContributor={vi.fn()} />);

    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('renders selected contributor identity pill', () => {
    render(
      <ContributorPicker
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
      <HeaderBar
        currentQuery="billing/retry.ts"
        onSubmitQuery={onSubmitMock}
        onSelectWorkspace={onWorkspaceMock}
        onSelectContributor={onContributorMock}
      />
    );

    expect(screen.getByText(/ARGON \/\/ 2077/i)).toBeInTheDocument();
    expect(screen.getByTestId('command-bar-input')).toHaveValue('billing/retry.ts');
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('contributor-picker-trigger')).toBeInTheDocument();
  });
});
