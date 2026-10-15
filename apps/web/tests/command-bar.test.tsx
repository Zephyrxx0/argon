import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandBar } from '@/components/command/command-bar';
import { CommandDialog } from '@/components/command/command-dialog';

describe('CommandBar Component', () => {
  it('renders input with placeholder copy and shortcut trigger', () => {
    const onSubmitMock = vi.fn();
    render(<CommandBar onSubmit={onSubmitMock} />);

    expect(
      screen.getByPlaceholderText(
        /Search scope \(e\.g\. billing\/retry\.ts, auth, why does legacy-sync exist\?\)\.\.\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-trigger')).toBeInTheDocument();
  });

  it('submits query when Enter key is pressed', () => {
    const onSubmitMock = vi.fn();
    render(<CommandBar onSubmit={onSubmitMock} />);

    const input = screen.getByTestId('command-bar-input');
    fireEvent.change(input, { target: { value: 'billing/retry.ts' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSubmitMock).toHaveBeenCalledWith('billing/retry.ts');
  });

  it('renders loading state indicator and disables input while computing', () => {
    render(<CommandBar onSubmit={vi.fn()} isLoading={true} />);

    const input = screen.getByTestId('command-bar-input');
    expect(input).toBeDisabled();
    expect(screen.getByPlaceholderText(/COMPUTING SCOPE EMBEDDING\.\.\./i)).toBeInTheDocument();
  });

  it('renders error tooltip banner when error prop is provided', () => {
    render(<CommandBar onSubmit={vi.fn()} error="File not found in active graph" />);

    expect(screen.getByText('File not found in active graph')).toBeInTheDocument();
  });

  it('opens CommandDialog on shortcut trigger click', () => {
    render(<CommandBar onSubmit={vi.fn()} />);

    expect(screen.queryByTestId('command-dialog')).not.toBeInTheDocument();

    const trigger = screen.getByTestId('command-palette-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('command-dialog')).toBeInTheDocument();
  });
});

describe('CommandDialog Component', () => {
  it('renders curated scenarios and notifies selection', () => {
    const onSelectMock = vi.fn();
    const onOpenChangeMock = vi.fn();

    render(
      <CommandDialog
        open={true}
        onOpenChange={onOpenChangeMock}
        onSelectQuery={onSelectMock}
      />
    );

    expect(screen.getByText('CURATED SCENARIOS')).toBeInTheDocument();

    const s1Item = screen.getByTestId('command-item-s1-blast-radius');
    fireEvent.click(s1Item);

    expect(onSelectMock).toHaveBeenCalledWith('Refactor billing/retry.ts');
    expect(onOpenChangeMock).toHaveBeenCalledWith(false);
  });
});
