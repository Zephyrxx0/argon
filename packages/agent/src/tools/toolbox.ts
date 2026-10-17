import { z } from 'zod';
import {
  BlastRadiusParamsSchema,
  ComponentOverviewParamsSchema,
  PathBetweenParamsSchema,
  ResolveScopeParamsSchema,
  RevertHistoryParamsSchema,
  RiskRankingParamsSchema,
  WhoKnowsParamsSchema,
} from '@argon/graph';
import type { GatewayClient, QueryName } from '../client/types.js';

/**
 * The Argon toolbox: every locked, parameterized graph query exposed as a typed tool.
 *
 * One definition feeds three consumers so they can never drift apart:
 *   - the MCP server (apps/mcp) for editors and external agents,
 *   - the LLM tool-selection planner (tools/planner.ts),
 *   - the deterministic briefing pipeline (through the same query names).
 *
 * There is deliberately NO free-form Cypher tool: the agent can only run reviewed,
 * parameterized queries, and every result is a graph traversal, not a guess.
 */

export interface EmbedderLike {
  embed(text: string, isQuery?: boolean): Promise<{ vector: number[] }>;
}

export interface ToolContext {
  client: GatewayClient;
  /** Needed by precedent_search (text -> 512-d vector). */
  embedder?: EmbedderLike;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface ToolOutput {
  ok: boolean;
  tool: string;
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
  evidence: { nodeCount: number; edgeCount: number; primaryIds: string[] };
  error?: string;
}

export interface ArgonToolDef {
  /** snake_case tool name (also the MCP tool name). */
  name: string;
  queryName: QueryName;
  title: string;
  description: string;
  /** Tool arguments (workspaceId is added by the transport layer, not here). */
  input: z.ZodObject<z.ZodRawShape>;
  /** One-line JSON shape shown to the planner LLM. */
  argsHint: string;
  /** Whether the LLM planner may choose this tool (resolve_scope is pipeline-only). */
  plannerSelectable: boolean;
  /** Maps validated tool arguments to the underlying query parameters. */
  prepare(args: any, ctx: ToolContext): Promise<unknown> | unknown;
}

const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidWorkspaceId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && WORKSPACE_ID_PATTERN.test(id);
}

export const ARGON_TOOLS: ArgonToolDef[] = [
  {
    name: 'resolve_scope',
    queryName: 'resolveScope',
    title: 'Resolve scope',
    description:
      'Resolve file paths and/or component names to the File and Component nodes that really exist in the graph. Use first when unsure whether a path or name is in the graph.',
    input: ResolveScopeParamsSchema,
    argsHint: '{"paths": string[], "names": string[]}',
    plannerSelectable: false,
    prepare: (a) => a,
  },
  {
    name: 'blast_radius',
    queryName: 'blastRadius',
    title: 'Blast radius',
    description:
      'Multi-hop traversal: from the given files to their components and every downstream component reachable through DEPENDS_ON (up to maxDepth hops). Answers "what breaks if I change this?".',
    input: BlastRadiusParamsSchema,
    argsHint: '{"files": string[], "maxDepth": 1-5}',
    plannerSelectable: true,
    prepare: (a) => a,
  },
  {
    name: 'risk_ranking',
    queryName: 'riskRanking',
    title: 'Risk ranking (PageRank)',
    description:
      'Runs the FalkorDB PageRank algorithm over the component dependency graph and returns the most central (highest-risk, most depended-upon) components.',
    input: RiskRankingParamsSchema,
    argsHint: '{"limit": 1-100}',
    plannerSelectable: true,
    prepare: (a) => a,
  },
  {
    name: 'who_knows',
    queryName: 'whoKnows',
    title: 'Who knows this area',
    description:
      'Finds the people who authored and the people who reviewed changes in the given components (separate counts, one row per person and role), plus the CODEOWNERS owner of record when the repository has one. Review and owner data exist only for repositories ingested with GitHub access. Use to recommend owners or reviewers.',
    input: WhoKnowsParamsSchema,
    argsHint: '{"components": string[]}',
    plannerSelectable: true,
    prepare: (a) => a,
  },
  {
    name: 'constraining_decisions',
    queryName: 'constrainingDecisions',
    title: 'Constraining decisions in force',
    description:
      'Returns the architectural decisions (ADRs/RFCs) that govern the given files and were in force at asOf (default: now). Superseded decisions are excluded by their temporal validity window.',
    input: z.object({
      files: z.array(z.string()).min(1),
      asOf: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Epoch milliseconds to evaluate decision validity at. Defaults to now.'),
    }),
    argsHint: '{"files": string[], "asOf"?: epoch-ms}',
    plannerSelectable: true,
    prepare: (a, ctx) => ({ files: a.files, asOf: a.asOf ?? (ctx.now ?? Date.now)() }),
  },
  {
    name: 'precedent_search',
    queryName: 'precedentSearch',
    title: 'Precedent search (vector + graph)',
    description:
      'Semantic search over past decisions with a 512-d vector index, each hit expanded through the graph to its governed component, the pull request it was extracted from and the issue that PR closed. Pass natural language; it is embedded for you.',
    input: z.object({
      query: z.string().min(1).max(2000).describe('Natural-language description of the change or problem.'),
      limit: z.number().int().min(1).max(50).default(5),
    }),
    argsHint: '{"query": string, "limit": 1-50}',
    plannerSelectable: true,
    prepare: async (a, ctx) => {
      if (!ctx.embedder) {
        throw new Error('precedent_search requires an embedder (none configured)');
      }
      const { vector } = await ctx.embedder.embed(a.query, true);
      return { queryVector: vector, limit: a.limit };
    },
  },
  {
    name: 'path_between',
    queryName: 'pathBetween',
    title: 'Shortest dependency path',
    description:
      'Runs the FalkorDB shortest-path algorithm (algo.SPpaths) over DEPENDS_ON between two components. Answers "how is A connected to B?" and builds learning paths / impact chains.',
    input: PathBetweenParamsSchema,
    argsHint: '{"sourceName": string, "targetName": string}',
    plannerSelectable: true,
    prepare: (a) => a,
  },
  {
    name: 'component_overview',
    queryName: 'componentOverview',
    title: 'Component overview',
    description:
      'Summary of one component: number of files, number of governing decisions, and the components it depends on.',
    input: ComponentOverviewParamsSchema,
    argsHint: '{"component": string}',
    plannerSelectable: true,
    prepare: (a) => a,
  },
  {
    name: 'revert_history',
    queryName: 'revertHistory',
    title: 'Revert history',
    description:
      'Revert commits that touched the given files and the changes they reverted. A revert on the same files is the strongest sign an area has bitten the team before.',
    input: RevertHistoryParamsSchema,
    argsHint: '{"files": string[], "limit": 1-100}',
    plannerSelectable: true,
    prepare: (a) => a,
  },
];

const TOOLS_BY_NAME = new Map(ARGON_TOOLS.map((t) => [t.name, t]));
const TOOLS_BY_QUERY = new Map(ARGON_TOOLS.map((t) => [t.queryName, t]));

export function getToolByName(name: string): ArgonToolDef | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function getToolByQueryName(queryName: QueryName): ArgonToolDef | undefined {
  return TOOLS_BY_QUERY.get(queryName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Result compaction: FalkorDB nodes / edges / paths -> small plain JSON for LLMs
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ROWS = 50;
const MAX_DEPTH = 4;
const MAX_ARRAY = 25;
const DROPPED_PROPERTIES = new Set(['embedding', 'embedding_model', 'email', 'email_hash']);

function canonicalId(node: { id?: unknown; properties?: Record<string, unknown> }): string {
  const p = node.properties ?? {};
  for (const key of ['id', 'name', 'path']) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  if (typeof p.number === 'number' || typeof p.number === 'string') return `PR-${p.number}`;
  return String(node.id);
}

function isNode(v: any): boolean {
  return v && typeof v === 'object' && Array.isArray(v.labels) && v.properties && typeof v.properties === 'object' && 'id' in v;
}
function isEdge(v: any): boolean {
  return v && typeof v === 'object' && typeof v.relationshipType === 'string' && 'sourceId' in v;
}
function isPath(v: any): boolean {
  return v && typeof v === 'object' && Array.isArray(v.nodes) && Array.isArray(v.edges);
}

export function compactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'object') return value;
  if (depth > MAX_DEPTH) return '<truncated>';

  if (Array.isArray(value)) {
    if (value.length > 16 && value.every((v) => typeof v === 'number')) return `<${value.length}-d vector>`;
    const items = value.slice(0, MAX_ARRAY).map((v) => compactValue(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`…+${value.length - MAX_ARRAY} more` as unknown);
    return items;
  }

  if (isPath(value)) {
    const p = value as { nodes: any[]; edges: any[] };
    return {
      _path: p.nodes.map((n) => canonicalId(n)),
      length: p.edges.length,
      relationships: p.edges.map((e) => e.relationshipType),
    };
  }
  if (isNode(value)) {
    const n = value as { labels: string[]; properties: Record<string, unknown> };
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.properties)) {
      if (!DROPPED_PROPERTIES.has(k)) props[k] = compactValue(v, depth + 1);
    }
    return { _label: n.labels[0] ?? 'Node', _id: canonicalId(n), ...props };
  }
  if (isEdge(value)) {
    const e = value as { relationshipType: string; properties?: Record<string, unknown> };
    return { _rel: e.relationshipType, ...(compactValue(e.properties ?? {}, depth + 1) as object) };
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (DROPPED_PROPERTIES.has(k)) continue;
    out[k] = compactValue(v, depth + 1);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

function failure(tool: string, message: string): ToolOutput {
  return {
    ok: false,
    tool,
    rows: [],
    rowCount: 0,
    truncated: false,
    evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] },
    error: message,
  };
}

/**
 * Validates arguments, runs one locked query through the gateway client and returns a
 * compact, citation-friendly result. Never throws: failures come back as `ok: false`
 * ("fail closed": an unreachable graph yields an error, never an ungrounded answer).
 */
export async function executeTool(
  ctx: ToolContext,
  workspaceId: string,
  toolName: string,
  rawArgs: unknown
): Promise<ToolOutput> {
  const def = TOOLS_BY_NAME.get(toolName);
  if (!def) return failure(toolName, `Unknown tool: ${toolName}`);
  if (!isValidWorkspaceId(workspaceId)) return failure(toolName, 'Invalid workspaceId');

  const parsed = def.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ');
    return failure(toolName, `Invalid arguments: ${detail}`);
  }

  try {
    const params = await def.prepare(parsed.data, ctx);
    const payload = await ctx.client.executeQuery(workspaceId, def.queryName, params as never);
    const raw = Array.isArray(payload.raw) ? payload.raw : payload.raw == null ? [] : [payload.raw];
    const rows = raw.slice(0, MAX_ROWS).map((r) => compactValue(r));
    return {
      ok: true,
      tool: toolName,
      rows,
      rowCount: raw.length,
      truncated: raw.length > MAX_ROWS,
      evidence: {
        nodeCount: payload.evidence?.nodeCount ?? 0,
        edgeCount: payload.evidence?.edgeCount ?? 0,
        primaryIds: (payload.evidence?.primaryIds ?? []).map(String),
      },
    };
  } catch (err: any) {
    return failure(toolName, err?.message ?? String(err));
  }
}
