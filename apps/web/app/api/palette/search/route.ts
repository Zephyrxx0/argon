import { NextRequest, NextResponse } from 'next/server';
import { withAuthorizedWorkspace } from '@/lib/workspace-api';
import { paletteSearch } from '@/lib/palette-search';

export const dynamic = 'force-dynamic';

const MAX_QUERY_LEN = 200;

/**
 * Semantic + literal search over a workspace graph, for the command palette.
 *   GET /api/palette/search?workspaceId=<id>&q=<text>
 *
 * Decisions are matched with the FalkorDB vector index; files/components by name/path. Enforces
 * the same tenant rules as /api/briefing and fails closed with 503 when FalkorDB is unreachable.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId') ?? '';
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, MAX_QUERY_LEN);

  if (!q.trim()) {
    return NextResponse.json({ query: '', hits: [] }, { status: 200 });
  }

  return withAuthorizedWorkspace(req, workspaceId, async (client) =>
    NextResponse.json(await paletteSearch(client, workspaceId, q), { status: 200 })
  );
}
