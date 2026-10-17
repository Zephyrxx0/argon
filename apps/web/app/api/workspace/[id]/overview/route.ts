import { NextRequest, NextResponse } from 'next/server';
import { withAuthorizedWorkspace } from '@/lib/workspace-api';
import { GRAPH_VIEWS, isGraphView, loadFileGraph, loadOverview } from '@/lib/workspace-data';

export const dynamic = 'force-dynamic';

/**
 * Graph payload for one workspace.
 * - `?view=overview` (default): architecture overview (components, couplings, owners, decisions)
 * - `?view=files`: files connected by co-change coupling
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const requested = req.nextUrl.searchParams.get('view') ?? 'overview';
  if (!isGraphView(requested)) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: `Invalid view. Expected one of: ${GRAPH_VIEWS.join(', ')}` },
      { status: 400 }
    );
  }

  return withAuthorizedWorkspace(req, id, async (client) =>
    NextResponse.json(requested === 'files' ? await loadFileGraph(client, id) : await loadOverview(client, id), {
      status: 200,
    })
  );
}
