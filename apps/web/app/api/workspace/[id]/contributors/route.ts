import { NextRequest, NextResponse } from 'next/server';
import { withAuthorizedWorkspace } from '@/lib/workspace-api';
import { loadContributors, type ContributorsResponse } from '@/lib/workspace-data';

export const dynamic = 'force-dynamic';

/** People mined from this workspace's repository (never from any other workspace). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withAuthorizedWorkspace(req, id, async (client) => {
    const body: ContributorsResponse = { workspaceId: id, contributors: await loadContributors(client, id) };
    return NextResponse.json(body, { status: 200 });
  });
}
