import type { QueryName } from '../client/types.js';

/** MCP / tool-facing (snake_case) name for every locked, parameterized graph query. */
export const QUERY_TO_TOOL_NAME: Record<QueryName, string> = {
  resolveScope: 'resolve_scope',
  blastRadius: 'blast_radius',
  riskRanking: 'risk_ranking',
  whoKnows: 'who_knows',
  constrainingDecisions: 'constraining_decisions',
  precedentSearch: 'precedent_search',
  pathBetween: 'path_between',
  componentOverview: 'component_overview',
  revertHistory: 'revert_history',
};

export type ToolTraceSource = 'pipeline' | 'llm';
export type ToolTraceStatus = 'ok' | 'error' | 'rejected' | 'skipped';

/**
 * One graph tool call made while answering a briefing. This is what makes an answer
 * explainable: which graph queries/algorithms ran, with which arguments, who chose them
 * (the fixed pipeline or the LLM planner), and what came back.
 */
export interface ToolTraceEntry {
  /** 0 = deterministic pipeline retrieval, 1..n = LLM planner step. */
  step: number;
  source: ToolTraceSource;
  tool: string;
  args: Record<string, unknown>;
  status: ToolTraceStatus;
  rowCount: number;
  evidenceIds: number;
  durationMs: number;
  note?: string;
}

const MAX_STRING = 120;
const MAX_ARRAY_PREVIEW = 5;

/** Makes arguments safe and small enough to put in a trace (no 512-d vectors, no huge lists). */
export function summarizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.length > 0 && value.every((v) => typeof v === 'number') && value.length > 16) {
        out[key] = `<${value.length}-d vector>`;
      } else if (value.length > MAX_ARRAY_PREVIEW) {
        out[key] = [...value.slice(0, MAX_ARRAY_PREVIEW).map(shorten), `…+${value.length - MAX_ARRAY_PREVIEW} more`];
      } else {
        out[key] = value.map(shorten);
      }
    } else {
      out[key] = shorten(value);
    }
  }
  return out;
}

function shorten(v: unknown): unknown {
  if (typeof v === 'string' && v.length > MAX_STRING) return `${v.slice(0, MAX_STRING)}…`;
  if (v && typeof v === 'object') return '<object>';
  return v;
}
