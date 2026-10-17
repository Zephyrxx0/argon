import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InsightPane } from '@/components/workspace/insight-pane';
import { CopyButton, CodeBlock } from '@/components/common/copy-button';
import {
  MCP_AGENTS,
  MCP_TOOLS,
  mcpServersJson,
  samplePrompt,
  type McpContext,
} from '@/lib/mcp-setup';

// The Pierre panels are client-only dynamic imports; stub them so the tab wiring is what we test.
vi.mock('@/components/files/file-tree-panel', () => ({
  FileTreePanel: () => <div data-testid="file-tree-panel-stub" />,
}));
vi.mock('@/components/diff/decision-diff-panel', () => ({
  DecisionDiffPanel: () => <div data-testid="decision-diff-panel-stub" />,
}));

const ctx: McpContext = { workspaceId: 'synthetic-demo', repoPathHint: '/path/to/argon' };

describe('lib/mcp-setup', () => {
  it('covers the major coding agents', () => {
    const ids = MCP_AGENTS.map((a) => a.id);
    for (const expected of ['claude-code', 'cursor', 'codex', 'gemini-cli', 'opencode', 'windsurf', 'generic']) {
      expect(ids).toContain(expected);
    }
  });

  it('every agent snippet is non-empty and pre-fills the workspace id', () => {
    for (const agent of MCP_AGENTS) {
      const snippet = agent.snippet(ctx);
      expect(snippet.length, agent.id).toBeGreaterThan(0);
      // the workspace id is interpolated everywhere except the bare generic command
      if (agent.id !== 'generic') {
        expect(snippet, agent.id).toContain('synthetic-demo');
      }
      // never a free-form cypher instruction
      expect(snippet.toLowerCase(), agent.id).not.toContain('cypher');
    }
  });

  it('JSON agents emit parseable JSON with the argon server and the start command', () => {
    for (const agent of MCP_AGENTS.filter((a) => a.kind === 'json')) {
      const parsed = JSON.parse(agent.snippet(ctx));
      const server =
        parsed.mcpServers?.argon ?? parsed.mcp?.argon ?? null;
      expect(server, agent.id).toBeTruthy();
      const asString = JSON.stringify(server);
      expect(asString).toContain('@argon/mcp');
      expect(asString).toContain('start');
      expect(asString).toContain('falkor://localhost:6379');
    }
  });

  it('the canonical mcpServers JSON is stable and well-formed', () => {
    const parsed = JSON.parse(mcpServersJson(ctx));
    expect(parsed.mcpServers.argon.command).toBe('pnpm');
    expect(parsed.mcpServers.argon.args).toEqual(['--silent', '--filter', '@argon/mcp', 'start']);
    expect(parsed.mcpServers.argon.env.ARGON_WORKSPACE_ID).toBe('synthetic-demo');
  });

  it('Codex emits TOML (not JSON) with the argon table', () => {
    const toml = MCP_AGENTS.find((a) => a.id === 'codex')!.snippet(ctx);
    expect(toml).toContain('[mcp_servers.argon]');
    expect(toml).toContain('command = "pnpm"');
    expect(() => JSON.parse(toml)).toThrow();
  });

  it('lists all 12 MCP tools including generate_briefing and no raw cypher tool', () => {
    expect(MCP_TOOLS).toHaveLength(12);
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain('generate_briefing');
    expect(names).toContain('revert_history');
    expect(names.some((n) => /cypher|raw/i.test(n))).toBe(false);
  });

  it('samplePrompt mentions the workspace', () => {
    expect(samplePrompt('argon-dogfood')).toContain('argon-dogfood');
  });
});

describe('CopyButton', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('writes the value and shows a transient confirmation', async () => {
    render(<CopyButton value="hello-world" />);
    const btn = screen.getByTestId('copy-button');
    expect(btn).toHaveAttribute('data-state', 'idle');
    fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello-world');
    await waitFor(() => expect(btn).toHaveAttribute('data-state', 'copied'));
    expect(btn).toHaveTextContent(/copied/i);
  });

  it('CodeBlock renders the code and a copy button', () => {
    render(<CodeBlock code="pnpm --filter @argon/mcp start" caption="config" />);
    expect(screen.getByText('pnpm --filter @argon/mcp start')).toBeInTheDocument();
    expect(screen.getByTestId('copy-button')).toBeInTheDocument();
  });

  it('reports failure instead of throwing when the clipboard rejects', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CopyButton value="x" />);
    const btn = screen.getByTestId('copy-button');
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('data-state', 'error'));
  });
});

describe('InsightPane tabs', () => {
  const renderPane = () =>
    render(<InsightPane workspaceId="synthetic-demo" graph={<div data-testid="graph-stub" />} />);

  it('shows five tabs: Graph, Files, Diff, MCP, Guide', () => {
    renderPane();
    for (const id of ['graph', 'files', 'diff', 'mcp', 'guide']) {
      expect(screen.getByTestId(`insight-tab-${id}`)).toBeInTheDocument();
    }
    // graph is the default selected tab
    expect(screen.getByTestId('insight-tab-graph')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('graph-stub')).toBeInTheDocument();
  });

  it('lazily mounts the MCP tab only after it is first opened, pre-filled with the workspace', () => {
    renderPane();
    expect(screen.queryByTestId('mcp-setup-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('insight-tab-mcp'));
    expect(screen.getByTestId('insight-tab-mcp')).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByTestId('mcp-setup-panel');
    expect(panel).toBeInTheDocument();
    // the default agent snippet carries the active workspace id
    expect(screen.getByTestId('mcp-snippet')).toHaveTextContent('synthetic-demo');
  });

  it('switches the MCP snippet when a different agent is picked', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('insight-tab-mcp'));
    fireEvent.click(screen.getByTestId('mcp-agent-codex'));
    expect(screen.getByTestId('mcp-snippet')).toHaveTextContent('[mcp_servers.argon]');
  });

  it('opens the Guide tab with the five-step walkthrough', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('insight-tab-guide'));
    expect(screen.getByTestId('guide-panel')).toBeInTheDocument();
    expect(screen.getByText(/How to use Argon/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick a workspace/i)).toBeInTheDocument();
  });

  it('keeps a visited tab mounted after switching away (state preserved)', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('insight-tab-mcp'));
    expect(screen.getByTestId('mcp-setup-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('insight-tab-guide'));
    // MCP panel stays in the DOM (hidden), so its scroll/selection survive
    expect(screen.getByTestId('mcp-setup-panel')).toBeInTheDocument();
    expect(screen.getByTestId('guide-panel')).toBeInTheDocument();
  });
});
