import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { paletteSearchMock, checkWorkspaceAccess, connect, close } = vi.hoisted(() => ({
  paletteSearchMock: vi.fn(),
  checkWorkspaceAccess: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@/lib/palette-search', () => ({ paletteSearch: paletteSearchMock }));
vi.mock('@argon/graph', () => ({
  ArgonGraphClient: class {
    connect = connect;
    close = close;
  },
  checkWorkspaceAccess,
}));

import { GET } from '@/app/api/palette/search/route';

const url = (params: Record<string, string>) =>
  new NextRequest(`http://localhost:3000/api/palette/search?${new URLSearchParams(params)}`);

describe('GET /api/palette/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkWorkspaceAccess.mockResolvedValue({ exists: true, allowed: true });
    paletteSearchMock.mockResolvedValue({ query: 'retry', hits: [{ type: 'file', id: 'a.ts', label: 'a.ts', desc: '', query: 'a.ts', score: 0 }] });
  });

  it('returns empty hits for a blank query without touching the graph', async () => {
    const res = await GET(url({ workspaceId: 'synthetic-demo', q: '  ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ query: '', hits: [] });
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a malformed workspaceId with 400', async () => {
    const res = await GET(url({ workspaceId: '../etc/passwd', q: 'retry' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
  });

  it('runs the search for an authorized workspace and returns the hits', async () => {
    const res = await GET(url({ workspaceId: 'synthetic-demo', q: 'retry' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hits).toHaveLength(1);
    expect(paletteSearchMock).toHaveBeenCalledWith(expect.anything(), 'synthetic-demo', 'retry');
    expect(close).toHaveBeenCalled();
  });

  it('returns 404 when the workspace does not exist', async () => {
    checkWorkspaceAccess.mockResolvedValue({ exists: false, allowed: false });
    const res = await GET(url({ workspaceId: 'ghost', q: 'retry' }));
    expect(res.status).toBe(404);
    expect(paletteSearchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks access', async () => {
    checkWorkspaceAccess.mockResolvedValue({ exists: true, allowed: false });
    const res = await GET(url({ workspaceId: 'private', q: 'retry' }));
    expect(res.status).toBe(403);
  });

  it('fails closed with 503 when FalkorDB is unreachable', async () => {
    connect.mockRejectedValueOnce(Object.assign(new Error('ECONNREFUSED'), { name: 'FalkorUnavailableError' }));
    const res = await GET(url({ workspaceId: 'synthetic-demo', q: 'retry' }));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('FALKORDB_TIMEOUT');
  });

  it('caps the query length', async () => {
    await GET(url({ workspaceId: 'synthetic-demo', q: 'x'.repeat(500) }));
    expect(paletteSearchMock.mock.calls[0]![2].length).toBeLessThanOrEqual(200);
  });
});
