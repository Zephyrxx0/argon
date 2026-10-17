import { NextRequest, NextResponse } from 'next/server';
import { withAuthorizedWorkspace } from '@/lib/workspace-api';

export const dynamic = 'force-dynamic';

const MAX_PAIRS = 200;

export interface DecisionSnapshot {
  id: string;
  title: string;
  status: string;
  summary: string;
  validFrom: number | null;
  validTo: number | null;
}

export interface Supersession {
  /** the decision in force */
  current: DecisionSnapshot;
  /** the decision it replaced */
  previous: DecisionSnapshot;
  components: string[];
}

export interface SupersessionsResponse {
  workspaceId: string;
  supersessions: Supersession[];
}

const SUPERSESSIONS_QUERY = `
MATCH (n:Decision)-[:SUPERSEDES]->(o:Decision)
OPTIONAL MATCH (n)-[:GOVERNS]->(c:Component)
RETURN n.id AS newId, n.title AS newTitle, n.status AS newStatus, n.summary AS newSummary,
       n.valid_from AS newFrom, n.valid_to AS newTo,
       o.id AS oldId, o.title AS oldTitle, o.status AS oldStatus, o.summary AS oldSummary,
       o.valid_from AS oldFrom, o.valid_to AS oldTo,
       collect(DISTINCT c.name) AS components
ORDER BY newFrom DESC
LIMIT ${MAX_PAIRS}
`;

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v));

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  return withAuthorizedWorkspace(req, id, async (client) => {
    const res = await client.roQuery<Record<string, unknown>>(id, SUPERSESSIONS_QUERY);
    const rows = (res.data ?? []) as Array<Record<string, unknown>>;

    const supersessions: Supersession[] = rows.map((r) => ({
      current: {
        id: str(r.newId),
        title: str(r.newTitle),
        status: str(r.newStatus, 'active'),
        summary: str(r.newSummary),
        validFrom: num(r.newFrom),
        validTo: num(r.newTo),
      },
      previous: {
        id: str(r.oldId),
        title: str(r.oldTitle),
        status: str(r.oldStatus, 'superseded'),
        summary: str(r.oldSummary),
        validFrom: num(r.oldFrom),
        validTo: num(r.oldTo),
      },
      components: Array.isArray(r.components) ? (r.components as unknown[]).map(String) : [],
    }));

    const body: SupersessionsResponse = { workspaceId: id, supersessions };
    return NextResponse.json(body, { status: 200 });
  });
}
