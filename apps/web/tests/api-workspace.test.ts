import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const roQuery = vi.fn();
const connect = vi.fn();
const close = vi.fn();
const checkWorkspaceAccess = vi.fn();

vi.mock('@argon/graph', () => ({
  ArgonGraphClient: vi.fn().mockImplementation(() => ({ connect, close, roQuery })),
  checkWorkspaceAccess: (...args: unknown[]) => checkWorkspaceAccess(...args),
}));

import { GET as getFiles } from '@/app/api/workspace/[id]/files/route';
import { GET as getSupersessions } from '@/app/api/workspace/[id]/supersessions/route';

const call = (handler: typeof getFiles, id: string, resource: string) =>
  handler(new NextRequest(`http://localhost/api/workspace/${id}/${resource}`), {
    params: Promise.resolve({ id }),
  });

describe('workspace read APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    checkWorkspaceAccess.mockResolvedValue({ exists: true, allowed: true });
  });

  it('rejects malformed workspace ids before touching the graph', async () => {
    const res = await call(getFiles, 'bad id;DROP', 'files');
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('returns 404 / 403 per the tenant guard', async () => {
    checkWorkspaceAccess.mockResolvedValueOnce({ exists: false, allowed: false });
    expect((await call(getFiles, 'ghost', 'files')).status).toBe(404);

    checkWorkspaceAccess.mockResolvedValueOnce({ exists: true, allowed: false });
    const res = await call(getSupersessions, 'private', 'supersessions');
    expect(res.status).toBe(403);
    expect(roQuery).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('fails closed with 503 when FalkorDB is unreachable', async () => {
    connect.mockRejectedValueOnce(Object.assign(new Error('down'), { name: 'FalkorUnavailableError' }));
    const res = await call(getFiles, 'synthetic-demo', 'files');
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('FALKORDB_TIMEOUT');
  });

  it('maps file rows, dropping rows without a path', async () => {
    roQuery.mockResolvedValueOnce({
      data: [
        { path: 'src/a.ts', component: 'core', touches: 3 },
        { path: 'README.md', component: null, touches: 0 },
        { path: null, component: 'x', touches: 1 },
      ],
    });
    const res = await call(getFiles, 'synthetic-demo', 'files');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.files).toEqual([
      { path: 'src/a.ts', component: 'core', touches: 3 },
      { path: 'README.md', component: null, touches: 0 },
    ]);
    expect(body.truncated).toBe(false);
  });

  it('maps supersession rows into current/previous snapshots', async () => {
    roQuery.mockResolvedValueOnce({
      data: [
        {
          newId: 'DEC-002', newTitle: 'New', newStatus: 'active', newSummary: 'n', newFrom: 2, newTo: null,
          oldId: 'DEC-001', oldTitle: 'Old', oldStatus: 'superseded', oldSummary: 'o', oldFrom: 1, oldTo: 2,
          components: ['billing'],
        },
      ],
    });
    const body = await (await call(getSupersessions, 'synthetic-demo', 'supersessions')).json();
    expect(body.supersessions[0].current).toMatchObject({ id: 'DEC-002', validTo: null });
    expect(body.supersessions[0].previous).toMatchObject({ id: 'DEC-001', validTo: 2 });
    expect(body.supersessions[0].components).toEqual(['billing']);
  });
});
