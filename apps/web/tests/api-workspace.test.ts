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
import { GET as getOverview } from '@/app/api/workspace/[id]/overview/route';

const call = (handler: typeof getFiles, id: string, resource: string) =>
  handler(new NextRequest(`http://localhost/api/workspace/${id}/${resource}`), {
    params: Promise.resolve({ id }),
  });

describe('workspace read APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roQuery.mockReset();
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

describe('overview API graph views', () => {
  const get = (id: string, query = '') =>
    getOverview(new NextRequest(`http://localhost/api/workspace/${id}/overview${query}`), {
      params: Promise.resolve({ id }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    roQuery.mockReset();
    connect.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    checkWorkspaceAccess.mockResolvedValue({ exists: true, allowed: true });
    roQuery.mockResolvedValue({ data: [] });
  });

  it('serves the architecture overview by default and for ?view=overview', async () => {
    for (const q of ['', '?view=overview']) {
      const body = await (await get('synthetic-demo', q)).json();
      expect(body.topFiles).toEqual([]); // overview shape
      expect(body.stats).toHaveProperty('components');
    }
  });

  it('serves the co-change file graph for ?view=files', async () => {
    roQuery.mockImplementation((_ws: string, cypher: string) => {
      if (cypher.includes('AS weight') && cypher.includes('CO_CHANGES') && cypher.includes('a.path'))
        return Promise.resolve({ data: [{ source: 'a.ts', target: 'b.ts', weight: 0.6, count: 4 }] });
      if (cypher.includes('count(f) AS total')) return Promise.resolve({ data: [{ total: 2 }] });
      if (cypher.includes('count(r) AS total')) return Promise.resolve({ data: [{ total: 1 }] });
      if (cypher.includes('f.path IN $paths'))
        return Promise.resolve({ data: [{ path: 'a.ts', component: 'src', touches: 3 }, { path: 'b.ts', component: 'src', touches: 3 }] });
      return Promise.resolve({ data: [] });
    });

    const res = await get('synthetic-demo', '?view=files');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.elements.nodes.map((n: any) => n.data.type)).toEqual(['File', 'File']);
    expect(body.elements.edges[0].data.label).toBe('CO_CHANGES');
    expect(body.stats).toMatchObject({ files: 2, edges: 1, totalFiles: 2 });
  });

  it('rejects unknown views before touching the graph', async () => {
    for (const q of ['?view=bogus', '?view=FILES', '?view=files;DROP']) {
      const res = await get('synthetic-demo', q);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_ERROR');
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it('keeps the tenant guard on the files view', async () => {
    checkWorkspaceAccess.mockResolvedValueOnce({ exists: true, allowed: false });
    expect((await get('private', '?view=files')).status).toBe(403);
    expect(roQuery).not.toHaveBeenCalled();
  });
});
