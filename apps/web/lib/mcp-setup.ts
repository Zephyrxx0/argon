/**
 * Per-agent MCP setup instructions for the Argon stdio MCP server.
 *
 * The command is always `pnpm --silent --filter @argon/mcp start` run from the repo root; only
 * the surrounding config format differs per agent. Keeping this as pure data lets the UI stay
 * declarative and lets a test assert every agent produces valid JSON / the documented shape.
 */

export interface McpAgentGuide {
  id: string;
  /** Display name of the coding agent. */
  name: string;
  /** Where the config lives (file path or command). */
  location: string;
  /** How the config is applied: a JSON file, a TOML file, or a CLI command. */
  kind: 'json' | 'toml' | 'command';
  /** The snippet the user copies. */
  snippet: (ctx: McpContext) => string;
  /** One-line note shown under the snippet. */
  note?: string;
}

export interface McpContext {
  /** Workspace id to pre-fill as the default (ARGON_WORKSPACE_ID). */
  workspaceId: string;
  /** Absolute repo path hint shown in prose (not interpolated into JSON). */
  repoPathHint: string;
}

const SERVER_COMMAND = 'pnpm';
const SERVER_ARGS = ['--silent', '--filter', '@argon/mcp', 'start'];

/** The canonical `mcpServers` JSON object (Claude Code, Cursor, Windsurf, Codex all accept this). */
export function mcpServersJson(ctx: McpContext): string {
  return JSON.stringify(
    {
      mcpServers: {
        argon: {
          command: SERVER_COMMAND,
          args: SERVER_ARGS,
          env: {
            FALKORDB_URL: 'falkor://localhost:6379',
            ARGON_WORKSPACE_ID: ctx.workspaceId,
          },
        },
      },
    },
    null,
    2
  );
}

/** Gemini CLI uses the same object but omits the top-level wrapper in some versions; keep wrapper. */
function geminiJson(ctx: McpContext): string {
  return mcpServersJson(ctx);
}

/** OpenCode uses a top-level `mcp` map with a `type: "local"` and a single `command` array. */
function openCodeJson(ctx: McpContext): string {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        argon: {
          type: 'local',
          command: [SERVER_COMMAND, ...SERVER_ARGS],
          enabled: true,
          environment: {
            FALKORDB_URL: 'falkor://localhost:6379',
            ARGON_WORKSPACE_ID: ctx.workspaceId,
          },
        },
      },
    },
    null,
    2
  );
}

/** Codex (the OpenAI CLI) reads TOML from ~/.codex/config.toml. */
function codexToml(ctx: McpContext): string {
  return [
    '[mcp_servers.argon]',
    `command = "${SERVER_COMMAND}"`,
    `args = ${JSON.stringify(SERVER_ARGS)}`,
    '',
    '[mcp_servers.argon.env]',
    'FALKORDB_URL = "falkor://localhost:6379"',
    `ARGON_WORKSPACE_ID = "${ctx.workspaceId}"`,
  ].join('\n');
}

/** Claude Code also supports a one-shot CLI that writes the config for you. */
function claudeAddCommand(ctx: McpContext): string {
  return [
    'claude mcp add argon \\',
    '  --env FALKORDB_URL=falkor://localhost:6379 \\',
    `  --env ARGON_WORKSPACE_ID=${ctx.workspaceId} \\`,
    `  -- ${SERVER_COMMAND} ${SERVER_ARGS.join(' ')}`,
  ].join('\n');
}

export const MCP_AGENTS: McpAgentGuide[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    location: '.mcp.json (project root) — or run the CLI below',
    kind: 'json',
    snippet: mcpServersJson,
    note: 'Project-scoped. Prefer the CLI (claude mcp add …) if you want it written for you.',
  },
  {
    id: 'claude-code-cli',
    name: 'Claude Code (CLI)',
    location: 'run from the repo root',
    kind: 'command',
    snippet: claudeAddCommand,
    note: 'Writes the same server entry Claude Code reads; then restart the session.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    location: '.cursor/mcp.json (project) or ~/.cursor/mcp.json (global)',
    kind: 'json',
    snippet: mcpServersJson,
    note: 'Settings → MCP shows the server once the file is saved; toggle it on.',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    location: '~/.codeium/windsurf/mcp_config.json',
    kind: 'json',
    snippet: mcpServersJson,
    note: 'Then click Refresh in Windsurf → Settings → MCP Servers.',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    location: '~/.codex/config.toml',
    kind: 'toml',
    snippet: codexToml,
    note: 'Codex uses TOML, not JSON. Restart codex after editing.',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    location: '~/.gemini/settings.json (global) or .gemini/settings.json (project)',
    kind: 'json',
    snippet: geminiJson,
    note: 'Same mcpServers shape as Claude/Cursor.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    location: 'opencode.json (project) or ~/.config/opencode/opencode.json',
    kind: 'json',
    snippet: openCodeJson,
    note: 'OpenCode uses a top-level "mcp" map with type "local".',
  },
  {
    id: 'generic',
    name: 'Any other MCP client',
    location: 'wherever your client lists stdio MCP servers',
    kind: 'command',
    snippet: () => `${SERVER_COMMAND} ${SERVER_ARGS.join(' ')}`,
    note: 'Launch this command over stdio with FALKORDB_URL (and optional ARGON_WORKSPACE_ID) in its env.',
  },
];

/** The tools the server exposes, shown so users know what to ask for. */
export const MCP_TOOLS: Array<{ name: string; blurb: string }> = [
  { name: 'generate_briefing', blurb: 'Full cited briefing + PROCEED/REVIEW/HOLD verdict + tool trace for a task.' },
  { name: 'blast_radius', blurb: 'What breaks if I change these files (multi-hop DEPENDS_ON).' },
  { name: 'who_knows', blurb: 'Authors and reviewers for the given components.' },
  { name: 'constraining_decisions', blurb: 'Decisions in force over these files at a point in time.' },
  { name: 'precedent_search', blurb: 'Vector + graph search over past decisions (text is embedded for you).' },
  { name: 'revert_history', blurb: 'Reverts that touched these files and what they reverted.' },
  { name: 'risk_ranking', blurb: 'PageRank over the component dependency graph.' },
  { name: 'counterfactual_impact', blurb: 'What-if: what a change to one component disturbs, ranked, with decisions and owners.' },
  { name: 'path_between', blurb: 'Shortest dependency path between two components.' },
  { name: 'component_overview', blurb: 'Files, decisions and dependencies of one component.' },
  { name: 'resolve_scope', blurb: 'Map paths/names to real graph entities.' },
  { name: 'record_outcome', blurb: 'Write a (:Briefing) memory node with CITES/ABOUT edges.' },
  { name: 'list_workspaces', blurb: 'List the graphs on the connected FalkorDB.' },
];

export const MCP_PREREQUISITES = [
  'Clone the Argon repo and run `pnpm install` from its root.',
  'Start the graph + demo data: `docker compose up -d` then `pnpm seed:showcase`.',
  'The MCP command runs from the repo root, so point your agent there (or use an absolute path).',
];

/** A natural-language prompt the user can paste to their agent to test the connection. */
export function samplePrompt(workspaceId: string): string {
  return `Use the argon MCP server (workspace ${workspaceId}): what is the blast radius of src/billing/retry.ts, who owns it, and has it been reverted before?`;
}
