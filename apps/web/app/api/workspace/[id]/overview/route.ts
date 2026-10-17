import { NextRequest, NextResponse } from 'next/server';
import { withAuthorizedWorkspace } from '@/lib/workspace-api';
import { loadOverview } from '@/lib/workspace-data';

export const dynamic = 'force-dynamic';

/** Architecture overview graph (components, couplings, owners, decisions) for one workspace. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withAuthorizedWorkspace(req, id, async (client) =>
    NextResponse.json(await loadOverview(client, id), { status: 200 })
  );
}
