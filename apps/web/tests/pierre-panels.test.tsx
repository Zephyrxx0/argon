import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pierre components render into shadow roots; stub them so we test our integration, not theirs.
const resetPaths = vi.fn();
const setGitStatus = vi.fn();
let onSelectionChange: ((paths: string[]) => void) | undefined;

vi.mock('@pierre/trees/react', () => ({
  useFileTree: (opts: { onSelectionChange?: (p: string[]) => void }) => {
    onSelectionChange = opts.onSelectionChange;
    return { model: { resetPaths, setGitStatus } };
  },
  FileTree: () => <div data-testid="pierre-tree" />,
}));

vi.mock('@pierre/diffs/react', () => ({
  MultiFileDiff: (props: { oldFile: { contents: string }; newFile: { contents: string }; options?: { diffStyle?: string } }) => (
    <div data-testid="pierre-diff" data-style={props.options?.diffStyle}>
      <pre data-testid="diff-old">{props.oldFile.contents}</pre>
      <pre data-testid="diff-new">{props.newFile.contents}</pre>
    </div>
  ),
}));

import { FileTreePanel } from '@/components/files/file-tree-panel';
import { DecisionDiffPanel } from '@/components/diff/decision-diff-panel';

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('FileTreePanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads files from the graph API, feeds the tree, and marks blast-radius files', async () => {
    global.fetch = vi.fn().mockReturnValue(
      json(200, {
        workspaceId: 'ws',
        truncated: false,
        files: [
          { path: 'src/billing/retry.ts', component: 'billing', touches: 4 },
          { path: 'src/auth/jwt.ts', component: 'auth', touches: 1 },
        ],
      })
    );

    render(<FileTreePanel workspaceId="ws" highlightComponents={['billing']} />);

    await waitFor(() => expect(screen.getByTestId('pierre-tree')).toBeInTheDocument(), { timeout: 4000 });
    expect(fetch).toHaveBeenCalledWith('/api/workspace/ws/files', expect.anything());
    expect(resetPaths).toHaveBeenCalledWith(['src/billing/retry.ts', 'src/auth/jwt.ts']);
    expect(setGitStatus).toHaveBeenLastCalledWith([{ path: 'src/billing/retry.ts', status: 'modified' }]);
    expect(screen.getByText(/1 in blast radius/)).toBeInTheDocument();

    React.act(() => onSelectionChange?.(['src/billing/retry.ts']));
    expect(await screen.findByText('4 touching')).toBeInTheDocument();
    expect(screen.getByText('in blast radius')).toBeInTheDocument();
  });

  it('fails closed with the kill-switch copy on 503', async () => {
    global.fetch = vi.fn().mockReturnValue(json(503, { reason: 'FalkorDB Graph Unreachable' }));
    render(<FileTreePanel workspaceId="ws" />);
    expect(await screen.findByText('No graph, no answer')).toBeInTheDocument();
    expect(screen.queryByTestId('pierre-tree')).not.toBeInTheDocument();
  });
});

describe('DecisionDiffPanel', () => {
  const pairs = [
    {
      current: { id: 'DEC-013', title: 'Distributed limiter', status: 'active', summary: 'redis', validFrom: 2, validTo: null },
      previous: { id: 'DEC-012', title: 'Local limiter', status: 'superseded', summary: 'memory', validFrom: 1, validTo: 2 },
      components: ['gateway'],
    },
    {
      current: { id: 'DEC-002', title: 'Backoff', status: 'active', summary: 'exp', validFrom: 4, validTo: null },
      previous: { id: 'DEC-001', title: 'Linear', status: 'superseded', summary: 'lin', validFrom: 3, validTo: 4 },
      components: ['billing'],
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockReturnValue(json(200, { workspaceId: 'ws', supersessions: pairs }));
  });

  it('shows the first supersession by default and switches on click', async () => {
    render(<DecisionDiffPanel workspaceId="ws" />);
    await waitFor(() => expect(screen.getByTestId('pierre-diff')).toBeInTheDocument());
    expect(screen.getByTestId('diff-old').textContent).toContain('DEC-012');

    fireEvent.click(screen.getByTestId('supersession-DEC-002'));
    expect(screen.getByTestId('diff-new').textContent).toContain('DEC-002');
  });

  it('preselects the supersession cited by the active briefing', async () => {
    render(<DecisionDiffPanel workspaceId="ws" citedDecisionIds={['d:DEC-001']} />);
    await waitFor(() => expect(screen.getByTestId('diff-old').textContent).toContain('DEC-001'));
  });

  it('toggles unified / split layout', async () => {
    render(<DecisionDiffPanel workspaceId="ws" />);
    await screen.findByTestId('pierre-diff');
    expect(screen.getByTestId('pierre-diff')).toHaveAttribute('data-style', 'unified');
    fireEvent.click(screen.getByTestId('diff-style-split'));
    expect(screen.getByTestId('pierre-diff')).toHaveAttribute('data-style', 'split');
  });

  it('renders an empty state and an error state', async () => {
    global.fetch = vi.fn().mockReturnValue(json(200, { workspaceId: 'ws', supersessions: [] }));
    const { unmount } = render(<DecisionDiffPanel workspaceId="ws" />);
    expect(await screen.findByTestId('decision-diff-empty')).toBeInTheDocument();
    unmount();

    global.fetch = vi.fn().mockReturnValue(json(503, { reason: 'down' }));
    render(<DecisionDiffPanel workspaceId="ws" />);
    expect(await screen.findByText('No graph, no answer')).toBeInTheDocument();
  });
});
