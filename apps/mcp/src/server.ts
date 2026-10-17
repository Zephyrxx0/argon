import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ArgonEmbedder, ArgonGraphClient } from '@argon/graph';
import {
  ARGON_TOOLS,
  executeTool,
  executeBriefingPipeline,
  isValidWorkspaceId,
  recordOutcome,
  type BriefingPipelineOptions,
  type EmbedderLike,
  type GatewayClient,
  type ToolOutput,
} from '@argon/agent';

export interface ArgonMcpServerOptions {
  /** Runs the locked graph queries (in-process or through the HTTP gateway). */
  client: GatewayClient;
  /** Needed for generate_briefing, record_outcome and list_workspaces. */
  graphClient?: ArgonGraphClient;
  /** Needed for precedent_search and generate_briefing (text -> 512-d vector). */
  embedder?: EmbedderLike;
  /** Used when a tool call omits workspaceId (env ARGON_WORKSPACE_ID in the stdio binary). */
  defaultWorkspaceId?: string;
  /** Test seam: replaces the narration LLM inside generate_briefing. */
  briefingGenerator?: (prompt: string) => Promise<unknown>;
  toolSelection?: BriefingPipelineOptions['toolSelection'];
  /** Called before every tool call so a dropped FalkorDB connection is re-established. */
  ensureConnected?: () => Promise<void>;
  name?: string;
  version?: string;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const WRITE_BACK = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const workspaceIdField = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, 'workspaceId may only contain letters, digits, "_" and "-"')
  .max(128)
  .optional()
  .describe(
    'Argon workspace (FalkorDB graph) to query, e.g. "synthetic-demo". Optional when the server has a default workspace; call list_workspaces to discover names.'
  );

function asResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
    ...(isError ? { isError: true } : {}),
  };
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Argon as an MCP server: every locked, parameterized graph query becomes a tool, plus the
 * full briefing pipeline and the write-back memory.
 *
 * Fail-closed by construction:
 *   - there is no free-form Cypher tool, only the reviewed queries;
 *   - if FalkorDB is unreachable a tool returns `isError` ("NO GRAPH, NO ANSWER"), never an
 *     ungrounded answer;
 *   - generate_briefing refuses (isError) when there is no graph data or when citations
 *     cannot be verified.
 */
export function createArgonMcpServer(options: ArgonMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: options.name ?? 'argon', version: options.version ?? '0.1.0' },
    {
      instructions:
        'Argon answers "what must I know before I touch this?" from a FalkorDB knowledge graph. ' +
        'Start with list_workspaces, then use the query tools (blast_radius, who_knows, constraining_decisions, revert_history, risk_ranking, path_between, ...) or generate_briefing for a cited briefing with a PROCEED/REVIEW/HOLD verdict. ' +
        'Every result is graph evidence: if a tool errors, there is no graph answer, do not guess.',
    }
  );

  const toolCtx = { client: options.client, embedder: options.embedder };

  const resolveWorkspace = (arg: string | undefined): string | null => {
    const id = arg ?? options.defaultWorkspaceId;
    return isValidWorkspaceId(id) ? id : null;
  };
  const MISSING_WORKSPACE =
    'workspaceId is required (none given and no default workspace configured). Call list_workspaces to see the available workspaces.';

  const connect = async () => {
    try {
      await options.ensureConnected?.();
    } catch {
      // a failed reconnect surfaces as FalkorUnavailableError on the query itself
    }
  };

  // 1. The locked graph queries, one tool each.
  for (const def of ARGON_TOOLS) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: { workspaceId: workspaceIdField, ...def.input.shape },
        annotations: { title: def.title, ...READ_ONLY },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const { workspaceId, ...toolArgs } = args;
        const ws = resolveWorkspace(workspaceId as string | undefined);
        if (!ws) return errorResult(MISSING_WORKSPACE);
        await connect();
        const out: ToolOutput = await executeTool(toolCtx, ws, def.name, toolArgs);
        if (!out.ok) {
          return errorResult(`NO GRAPH, NO ANSWER: ${def.name} failed: ${out.error}`);
        }
        return asResult(out);
      }
    );
  }

  // 2. The full briefing pipeline.
  server.registerTool(
    'generate_briefing',
    {
      title: 'Generate briefing',
      description:
        'Runs the full Argon pipeline for a task: scope resolution, graph retrieval, optional LLM tool selection, cited narration with fail-closed citation verification, a deterministic PROCEED/REVIEW/HOLD verdict and a tool trace. Also writes a (:Briefing) memory node. Errors (isError) mean there is no verified graph answer.',
      inputSchema: {
        workspaceId: workspaceIdField,
        task: z.string().min(1).max(4000).describe('What you are about to change, in plain language.'),
        files: z.array(z.string()).max(50).optional().describe('Repo-relative file paths in scope.'),
        components: z.array(z.string()).max(50).optional().describe('Component names in scope.'),
        asOf: z.number().int().positive().optional().describe('Epoch ms to evaluate decisions at. Defaults to now.'),
        contributorId: z.string().optional().describe('Person id to attribute the briefing to.'),
      },
      annotations: { title: 'Generate briefing', ...WRITE_BACK },
    },
    async (args): Promise<CallToolResult> => {
      const ws = resolveWorkspace(args.workspaceId);
      if (!ws) return errorResult(MISSING_WORKSPACE);
      await connect();
      try {
        const response = await executeBriefingPipeline({
          client: options.client,
          graphClient: options.graphClient,
          embedder: options.embedder as ArgonEmbedder | undefined,
          workspaceId: ws,
          request: {
            task: args.task,
            files: args.files,
            components: args.components,
            asOf: args.asOf,
            contributorId: args.contributorId,
          },
          customGenerator: options.briefingGenerator,
          toolSelection: options.toolSelection,
        });
        return asResult(response, response.status !== 'SUCCESS');
      } catch (err: any) {
        return errorResult(`NO GRAPH, NO ANSWER: briefing failed: ${err?.message ?? err}`);
      }
    }
  );

  // 3. Write-back memory.
  server.registerTool(
    'record_outcome',
    {
      title: 'Record outcome',
      description:
        'Writes a (:Briefing) memory node to the graph with [:CITES] edges to the graph nodes you relied on and [:ABOUT] edges to the affected components, so later briefings and humans can see what was decided and why. Ids that do not exist in the graph are ignored.',
      inputSchema: {
        workspaceId: workspaceIdField,
        task: z.string().min(1).max(4000),
        summary: z.string().min(1).max(4000),
        citedNodeIds: z.array(z.string().min(1)).max(100).default([]),
        affectedComponents: z.array(z.string().min(1)).max(100).default([]),
        contributorId: z.string().optional(),
        verdict: z.enum(['PROCEED', 'REVIEW', 'HOLD']).optional(),
      },
      annotations: { title: 'Record outcome', ...WRITE_BACK },
    },
    async (args): Promise<CallToolResult> => {
      const ws = resolveWorkspace(args.workspaceId);
      if (!ws) return errorResult(MISSING_WORKSPACE);
      if (!options.graphClient) return errorResult('record_outcome requires a direct graph connection.');
      await connect();
      try {
        const result = await recordOutcome(options.graphClient, {
          workspaceId: ws,
          task: args.task,
          summary: args.summary,
          citedNodeIds: args.citedNodeIds,
          affectedComponents: args.affectedComponents,
          contributorId: args.contributorId,
          actorId: 'mcp',
          verdict: args.verdict,
        });
        return asResult({ ok: true, ...result });
      } catch (err: any) {
        return errorResult(`NO GRAPH, NO ANSWER: record_outcome failed: ${err?.message ?? err}`);
      }
    }
  );

  // 4. Discovery.
  server.registerTool(
    'list_workspaces',
    {
      title: 'List workspaces',
      description: 'Lists the workspace (graph) names available on the connected FalkorDB instance.',
      inputSchema: {},
      annotations: { title: 'List workspaces', ...READ_ONLY },
    },
    async (): Promise<CallToolResult> => {
      if (!options.graphClient) return errorResult('list_workspaces requires a direct graph connection.');
      await connect();
      try {
        const names = (await options.graphClient.getRawClient().list()) as string[];
        return asResult({ workspaces: [...names].sort(), defaultWorkspaceId: options.defaultWorkspaceId ?? null });
      } catch (err: any) {
        return errorResult(`NO GRAPH, NO ANSWER: list_workspaces failed: ${err?.message ?? err}`);
      }
    }
  );

  return server;
}
