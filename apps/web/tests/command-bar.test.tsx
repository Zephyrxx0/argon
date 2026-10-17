import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandBar } from '@/components/command/command-bar';
import { SCENARIO_PRESETS } from '@/lib/scenarios';
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
        curated
        scenarios={SCENARIO_PRESETS}
      />
    );

    expect(screen.getByText('CURATED SCENARIOS')).toBeInTheDocument();

    const s1Item = screen.getByTestId('command-item-s1-blast-radius');
    fireEvent.click(s1Item);

    expect(onSelectMock).toHaveBeenCalledWith('Refactor billing/retry.ts');
    expect(onOpenChangeMock).toHaveBeenCalledWith(false);
  });

  it('shows only the workspace\'s own suggestions and entities (no built-in samples)', () => {
    render(
      <CommandDialog
        open={true}
        onOpenChange={vi.fn()}
        onSelectQuery={vi.fn()}
        scenarios={[]}
        entities={[{ type: 'file', label: 'lib/utils.ts', query: 'lib/utils.ts', desc: 'in lib' }]}
      />
    );
    expect(screen.queryByText('CURATED SCENARIOS')).not.toBeInTheDocument();
    expect(screen.getByText('lib/utils.ts')).toBeInTheDocument();
    expect(screen.queryByText('billing/retry.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('BillingEngine')).not.toBeInTheDocument();
  });

  it('the scrollable list has a shrinkable flex ancestor chain so it can actually scroll', () => {
    render(
      <CommandDialog
        open
        onOpenChange={vi.fn()}
        onSelectQuery={vi.fn()}
        entities={[{ type: 'file', label: 'a.ts', query: 'a.ts', desc: 'x' }]}
      />
    );
    const list = screen.getByTestId('command-palette-list');
    // the list scrolls...
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('min-h-0');
    // ...and every flex ancestor up to the capped dialog must allow shrinking (min-h-0),
    // otherwise flex-1 never bounds the list and the scroll is dead (the reported bug).
    let el: HTMLElement | null = list.parentElement;
    let sawCap = false;
    while (el && !sawCap) {
      const cls = el.className || '';
      if (cls.includes('flex') && cls.includes('flex-col')) {
        expect(cls).toContain('min-h-0');
      }
      if (cls.includes('max-h-')) sawCap = true;
      el = el.parentElement;
    }
    expect(sawCap).toBe(true);
  });
});

