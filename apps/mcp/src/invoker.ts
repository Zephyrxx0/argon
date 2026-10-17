import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ARGON_TOOLS, type ToolInvoker, type ToolOutput } from '@argon/agent';

function failure(tool: string, error: string): ToolOutput {
  return {
    ok: false,
    tool,
    rows: [],
    rowCount: 0,
    truncated: false,
    evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] },
    error,
  };
}

/**
 * A ToolInvoker whose tool calls go through an MCP client. Plugging this into the briefing
 * pipeline (`toolSelection.invoker`) makes the agent's tool selection literally happen over
 * MCP: the LLM planner chooses from the tools the MCP server advertises, and each call is a
 * `tools/call` request.
 */
export async function createMcpToolInvoker(
  client: Client,
  workspaceId: string
): Promise<ToolInvoker> {
  const advertised = new Set((await client.listTools()).tools.map((t) => t.name));
  const specs = ARGON_TOOLS.filter((t) => t.plannerSelectable && advertised.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    argsHint: t.argsHint,
  }));
  const allowed = new Set(specs.map((s) => s.name));

  return {
    specs: () => specs,
    call: async (name, args) => {
      if (!allowed.has(name)) return failure(name, `Tool not available over MCP: ${name}`);
      try {
        const res = await client.callTool({
          name,
          arguments: { workspaceId, ...((args as Record<string, unknown>) ?? {}) },
        });
        if (res.isError) {
          const text = Array.isArray(res.content)
            ? res.content.map((c: any) => (c?.type === 'text' ? c.text : '')).join(' ')
            : 'tool error';
          return failure(name, text || 'tool error');
        }
        const structured = res.structuredContent as ToolOutput | undefined;
        if (structured && typeof structured === 'object' && 'ok' in structured) return structured;
        return failure(name, 'MCP tool returned no structured content');
      } catch (err: any) {
        return failure(name, err?.message ?? String(err));
      }
    },
  };
}
