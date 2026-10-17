import { NextRequest, NextResponse } from 'next/server';
import { withAuthorizedWorkspace } from '@/lib/workspace-api';

export const dynamic = 'force-dynamic';

const MAX_FILES = 2000;

export interface WorkspaceFile {
  path: string;
  component: string | null;
  /** number of merged PRs that touched this file */
  touches: number;
}

export interface WorkspaceFilesResponse {
  workspaceId: string;
  files: WorkspaceFile[];
  truncated: boolean;
}

const FILES_QUERY = `
MATCH (f:File)
OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
OPTIONAL MATCH (pr:PullRequest)-[:TOUCHES]->(f)
RETURN f.path AS path, c.name AS component, count(DISTINCT pr) AS touches
ORDER BY path
LIMIT ${MAX_FILES + 1}
`;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  return withAuthorizedWorkspace(req, id, async (client) => {
    const res = await client.roQuery<Record<string, unknown>>(id, FILES_QUERY);
    const rows = (res.data ?? []) as Array<Record<string, unknown>>;

    const files: WorkspaceFile[] = rows
      .filter((r) => typeof r.path === 'string' && r.path.length > 0)
      .slice(0, MAX_FILES)
      .map((r) => ({
        path: r.path as string,
        component: typeof r.component === 'string' ? r.component : null,
        touches: Number(r.touches ?? 0),
      }));

    const body: WorkspaceFilesResponse = {
      workspaceId: id,
      files,
      truncated: rows.length > MAX_FILES,
    };
    return NextResponse.json(body, { status: 200 });
  });
}
