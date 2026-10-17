import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandDialog } from '@/components/command/command-dialog';
import { paletteSearch, __setPaletteEmbedder, PALETTE_LIMITS } from '@/lib/palette-search';
import { createPaletteSearch } from '@/lib/palette-search-client';
import type { PaletteSearchHit } from '@/lib/palette-search-client';

// ── lib/palette-search (live FalkorDB, injected deterministic embedder) ──────────────────────

const VEC = (i: number) => {
  const v = new Array(512).fill(0);
  v[i] = 1;
  return v;
};

async function falkorLive(): Promise<{ client: any; ArgonGraphClient: any } | null> {
  try {
    const graph = await import('@argon/graph');
    const client = new graph.ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await client.connect();
    const ok = await client.ping();
    if (!ok) {
      await client.close();
      return null;
    }
    return { client, ArgonGraphClient: graph.ArgonGraphClient };
  } catch {
    return null;
  }
}

const live = await falkorLive();

describe.skipIf(!live)('paletteSearch (live FalkorDB)', () => {
  const ws = `test_palette_${Date.now()}`;
  let client: any;

  beforeEach(async () => {
    client = live!.client;
    const graph = await import('@argon/graph');
    try {
      await client.query(ws, 'MATCH (n) DETACH DELETE n');
    } catch {
      /* new graph */
    }
    await graph.initWorkspaceGraph(client, ws);
    await client.query(
      ws,
      `CREATE (f1:File {path: 'src/billing/retry.ts'})
       CREATE (f2:File {path: 'src/auth/jwt.ts'})
       CREATE (c1:Component {name: 'billing'})
       CREATE (c2:Component {name: 'auth'})
       CREATE (f1)-[:IN_COMPONENT]->(c1)
       CREATE (f2)-[:IN_COMPONENT]->(c2)
       CREATE (d1:Decision {id: 'DEC-001', title: 'Linear Retry Backoff', status: 'superseded', valid_from: 1, embedding: vecf32($v0)})
       CREATE (d2:Decision {id: 'DEC-004', title: 'Short-lived JWT rotation', status: 'active', valid_from: 1, embedding: vecf32($v1)})
       CREATE (d1)-[:GOVERNS]->(c1)
       CREATE (d2)-[:GOVERNS]->(c2)
       CREATE (pr:PullRequest {id: 'pr1'})-[:TOUCHES]->(f1)`,
      { v0: VEC(0), v1: VEC(1) }
    );
    // every query embeds to the "DEC-001" vector, so DEC-001 is the nearest decision
    __setPaletteEmbedder({ embed: async () => ({ vector: VEC(0) }) } as any);
  });

  afterEach(() => __setPaletteEmbedder(null));

  it('ranks the nearest decision first (vector) and attaches its governed component', async () => {
    const { hits } = await paletteSearch(client, ws, 'how should retries back off?');
    const decisions = hits.filter((h) => h.type === 'decision');
    expect(decisions[0]!.id).toBe('DEC-001');
    expect(decisions[0]!.desc).toContain('billing');
    expect(decisions[0]!.score).toBeGreaterThan(0.99);
    // the selectable query asks the briefing about that decision
    expect(decisions[0]!.query).toContain('Linear Retry Backoff');
  });

  it('matches files and components by name (literal), with context', async () => {
    const { hits } = await paletteSearch(client, ws, 'billing');
    expect(hits.find((h) => h.type === 'file' && h.id === 'src/billing/retry.ts')).toBeTruthy();
    const comp = hits.find((h) => h.type === 'component' && h.id === 'billing');
    expect(comp?.desc).toContain('file');
    // a file hit carries the path as its briefing query
    expect(hits.find((h) => h.type === 'file')!.query).toBe('src/billing/retry.ts');
  });

  it('never exceeds the total cap and returns [] for a blank query', async () => {
    const { hits } = await paletteSearch(client, ws, 'e');
    expect(hits.length).toBeLessThanOrEqual(PALETTE_LIMITS.total);
    expect((await paletteSearch(client, ws, '   ')).hits).toEqual([]);
  });

  it('does not leak embeddings into results', async () => {
    const { hits } = await paletteSearch(client, ws, 'jwt');
    expect(JSON.stringify(hits)).not.toContain('embedding');
  });
});

// ── lib/palette-search-client (fetch wrapper) ────────────────────────────────────────────────

describe('createPaletteSearch (client)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the route with the workspace, query and bearer token, returning hits', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: 'x', hits: [{ type: 'file', id: 'a.ts', label: 'a.ts', desc: '', query: 'a.ts', score: 0 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const fn = createPaletteSearch('synthetic-demo', async () => 'tok');
    const hits = await fn('retry', new AbortController().signal);
    expect(hits).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('workspaceId=synthetic-demo');
    expect(url).toContain('q=retry');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });

  it('returns [] (so the UI falls back to local filter) on non-ok, network error or abort', async () => {
    const fn = createPaletteSearch('ws', async () => null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await fn('q', new AbortController().signal)).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')));
    expect(await fn('q', new AbortController().signal)).toEqual([]);
  });

  it('omits the Authorization header for anonymous callers and skips blank queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const fn = createPaletteSearch('ws', async () => null);
    expect(await fn('  ', new AbortController().signal)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await fn('q', new AbortController().signal);
    expect((fetchMock.mock.calls[0]![1] as any).headers.Authorization).toBeUndefined();
  });
});

// ── CommandDialog semantic group (debounce, abort, fallback) ─────────────────────────────────

const hits: PaletteSearchHit[] = [
  { type: 'decision', id: 'DEC-002', label: 'Exponential Backoff', desc: 'governs billing · active', query: 'What does Exponential Backoff constrain in billing?', score: 0.9 },
  { type: 'file', id: 'src/billing/retry.ts', label: 'src/billing/retry.ts', desc: 'in billing · 3 PRs', query: 'src/billing/retry.ts', score: 0 },
];

describe('CommandDialog semantic search', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const type = (text: string) =>
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: text } });

  it('debounces, shows a SEMANTIC MATCHES group, and submits the hit query on select', async () => {
    const onSemanticSearch = vi.fn().mockResolvedValue(hits);
    const onSelectQuery = vi.fn();
    render(
      <CommandDialog open onOpenChange={() => {}} onSelectQuery={onSelectQuery} onSemanticSearch={onSemanticSearch} />
    );

    type('retry storms');
    // not called before the debounce elapses
    expect(onSemanticSearch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(260);
      // let the awaited onSemanticSearch promise + state update flush under fake timers
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSemanticSearch).toHaveBeenCalledTimes(1);
    expect(onSemanticSearch.mock.calls[0]![0]).toBe('retry storms');

    expect(screen.getByText('SEMANTIC MATCHES')).toBeInTheDocument();
    expect(screen.getByTestId('command-semantic-decision')).toHaveTextContent('Exponential Backoff');

    fireEvent.click(screen.getByTestId('command-semantic-decision'));
    expect(onSelectQuery).toHaveBeenCalledWith('What does Exponential Backoff constrain in billing?');
  });

  it('does not fire for queries shorter than 2 chars', async () => {
    const onSemanticSearch = vi.fn().mockResolvedValue(hits);
    render(<CommandDialog open onOpenChange={() => {}} onSelectQuery={() => {}} onSemanticSearch={onSemanticSearch} />);
    type('a');
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(onSemanticSearch).not.toHaveBeenCalled();
    expect(screen.queryByText('SEMANTIC MATCHES')).not.toBeInTheDocument();
  });

  it('cancels the in-flight request when the query changes again (abort)', async () => {
    const signals: AbortSignal[] = [];
    const onSemanticSearch = vi.fn((_q: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<PaletteSearchHit[]>(() => {}); // never resolves
    });
    render(<CommandDialog open onOpenChange={() => {}} onSelectQuery={() => {}} onSemanticSearch={onSemanticSearch} />);
    type('retr');
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    type('retry');
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it('works without onSemanticSearch: no group, local suggestions still render', () => {
    render(
      <CommandDialog
        open
        onOpenChange={() => {}}
        onSelectQuery={() => {}}
        scenarios={[{ id: 's1', badge: 'B', title: 'Scenario One', query: 'q', description: 'd', iconName: 'layers', accentColor: '' }]}
      />
    );
    expect(screen.queryByText('SEMANTIC MATCHES')).not.toBeInTheDocument();
    expect(screen.getByTestId('command-item-s1')).toBeInTheDocument();
  });
});
