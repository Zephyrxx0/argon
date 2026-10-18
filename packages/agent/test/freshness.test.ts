import { describe, it, expect, vi } from 'vitest';
import { ageInDays, computeFreshness, toEpochSeconds, STALE_AFTER_DAYS } from '../src/briefing/freshness.js';
import { executeBriefingPipeline } from '../src/briefing/pipeline.js';
import type { GatewayClient } from '../src/client/types.js';
import type { ArgonEmbedder } from '@argon/graph';

const DAY = 86_400;
const NOW = 1_700_000_000; // fixed clock, epoch seconds
const daysAgo = (n: number) => NOW - n * DAY;

describe('ageInDays / toEpochSeconds', () => {
  it('counts whole days between valid_from and the clock', () => {
    expect(ageInDays(daysAgo(0), NOW)).toBe(0);
    expect(ageInDays(daysAgo(35) - 100, NOW)).toBe(35);
    expect(ageInDays(daysAgo(400), NOW)).toBe(400);
  });

  it('accepts epoch seconds or milliseconds for both the date and the clock', () => {
    expect(toEpochSeconds(NOW * 1000)).toBe(NOW);
    expect(toEpochSeconds(NOW)).toBe(NOW);
    expect(ageInDays(daysAgo(10) * 1000, NOW * 1000)).toBe(10);
    expect(ageInDays(daysAgo(10), NOW * 1000)).toBe(10); // mixed units (Date.now() vs stored seconds)
  });

  it('is null without a usable date and never negative for a future date', () => {
    for (const v of [undefined, null, 0, -5, Number.NaN]) expect(ageInDays(v as number, NOW)).toBeNull();
    expect(ageInDays(NOW + 5 * DAY, NOW)).toBe(0);
  });
});

describe('computeFreshness', () => {
  const fresh = { decisionId: 'DEC-NEW', validFrom: daysAgo(30), status: 'active' };
  const stale = { decisionId: 'DEC-OLD', validFrom: daysAgo(400), status: 'active' };

  it('flags a decision as stale only beyond the threshold (boundary: 180 days is fine, 181 is stale)', () => {
    const s = computeFreshness(
      [
        { decisionId: 'AT', validFrom: daysAgo(STALE_AFTER_DAYS) },
        { decisionId: 'OVER', validFrom: daysAgo(STALE_AFTER_DAYS + 1) },
      ],
      ['AT', 'OVER'],
      NOW
    )!;
    const by = Object.fromEntries(s.decisions.map((d) => [d.decisionId, d]));
    expect(by.AT).toMatchObject({ ageDays: 180, stale: false });
    expect(by.OVER).toMatchObject({ ageDays: 181, stale: true });
  });

  it('summarises "N of M cited decisions" with the oldest age', () => {
    const s = computeFreshness([fresh, stale], ['DEC-NEW', 'DEC-OLD'], NOW)!;
    expect(s).toMatchObject({ staleAfterDays: 180, citedWithKnownAge: 2, staleCited: 1, oldestCitedAgeDays: 400 });
    expect(s.message).toBe('1 of 2 cited decisions have been in force for more than 180 days (oldest: 400 days). Check they still hold.');
  });

  it('says everything is recent when nothing is stale (fresh fixture)', () => {
    const s = computeFreshness([fresh], ['DEC-NEW'], NOW)!;
    expect(s).toMatchObject({ staleCited: 0, citedWithKnownAge: 1, oldestCitedAgeDays: 30 });
    expect(s.message).toBe('All 1 cited decision is recent (in force for 180 days or less).');
    expect(s.decisions).toEqual([{ decisionId: 'DEC-NEW', ageDays: 30, stale: false }]);
  });

  it('uses singular / plural correctly', () => {
    expect(computeFreshness([stale], ['DEC-OLD'], NOW)!.message).toMatch(/^1 of 1 cited decision has been/);
    expect(computeFreshness([fresh, { ...fresh, decisionId: 'B' }], ['DEC-NEW', 'B'], NOW)!.message).toMatch(/^All 2 cited decisions are recent/);
  });

  it('only counts decisions the briefing actually cites, but still reports ages for all of them', () => {
    const s = computeFreshness([fresh, stale], ['DEC-NEW'], NOW)!;
    expect(s).toMatchObject({ citedWithKnownAge: 1, staleCited: 0 });
    expect(s.decisions.find((d) => d.decisionId === 'DEC-OLD')).toMatchObject({ stale: true });
  });

  it('ignores superseded precedents (retired by definition) when judging the guidance in force', () => {
    const s = computeFreshness([fresh, { decisionId: 'DEC-RETIRED', validFrom: daysAgo(900), status: 'superseded' }], ['DEC-NEW', 'DEC-RETIRED'], NOW)!;
    expect(s).toMatchObject({ citedWithKnownAge: 1, staleCited: 0 });
  });

  it('reports unknown freshness for undated decisions instead of guessing', () => {
    const s = computeFreshness([{ decisionId: 'X' }], ['X'], NOW)!;
    expect(s).toMatchObject({ citedWithKnownAge: 0, staleCited: 0, oldestCitedAgeDays: null });
    expect(s.message).toMatch(/freshness is unknown/);
    expect(s.decisions[0]).toEqual({ decisionId: 'X', ageDays: null, stale: false });
  });

  it('returns nothing when there are no decisions, and de-duplicates repeated ones', () => {
    expect(computeFreshness([], [], NOW)).toBeUndefined();
    expect(computeFreshness([fresh, fresh], ['DEC-NEW'], NOW)!.decisions).toHaveLength(1);
  });
});

const payload = (raw: unknown[], primaryIds: string[] = []) => ({
  raw,
  graph: { nodes: [], edges: [] },
  evidence: { nodeCount: raw.length, edgeCount: 0, primaryIds },
});
const embedder = { embed: async () => ({ vector: new Array(512).fill(0.05) }) } as unknown as ArgonEmbedder;

function client(): GatewayClient {
  return {
    executeQuery: vi.fn(async (_ws: string, name: string) => {
      switch (name) {
        case 'resolveScope':
          return payload([{ matchedFiles: [{ properties: { path: 'src/billing/retry.ts' } }], allComponents: [{ properties: { name: 'billing' } }] }]);
        case 'blastRadius':
          return payload([{ f: { properties: { path: 'src/billing/retry.ts' } }, c: { properties: { name: 'billing' } } }], ['billing']);
        case 'constrainingDecisions':
          return payload(
            [
              { id: 'DEC-002', title: 'Backoff', status: 'active', component: 'billing', validFrom: daysAgo(400) },
              { id: 'CHAT-1', title: 'Retry budget', status: 'accepted', component: 'billing', validFrom: daysAgo(20) },
            ],
            ['DEC-002', 'CHAT-1']
          );
        default:
          return payload([]);
      }
    }),
  } as unknown as GatewayClient;
}

describe('pipeline: freshness in the response (fixed clock)', () => {
  const briefing = {
    summary: {
      overview: 'Retries are governed.',
      riskLevel: 'medium',
      keyTakeaways: [{ claim: 'Two rules apply.', citedNodeIds: ['DEC-002', 'CHAT-1'] }],
    },
    blastRadius: { analysis: 'billing', affectedComponents: [] },
    keyOwners: [],
    constrainingDecisions: [],
    precedents: [],
  };

  it('computes ages from the injected clock and flags the old decision, not the new one', async () => {
    const res = await executeBriefingPipeline({
      client: client(), embedder, workspaceId: 'ws', toolSelection: false,
      request: { task: 'Refactor billing', files: ['src/billing/retry.ts'] },
      customGenerator: async () => briefing,
      now: () => NOW * 1000,
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.freshness).toMatchObject({ citedWithKnownAge: 2, staleCited: 1, oldestCitedAgeDays: 400 });
    const by = Object.fromEntries(res.freshness!.decisions.map((d) => [d.decisionId, d]));
    expect(by['DEC-002']).toMatchObject({ ageDays: 400, stale: true });
    expect(by['CHAT-1']).toMatchObject({ ageDays: 20, stale: false });
  });

  it('a different clock changes the ages (the signal really comes from the clock)', async () => {
    const later = await executeBriefingPipeline({
      client: client(), embedder, workspaceId: 'ws', toolSelection: false,
      request: { task: 'Refactor billing', files: ['src/billing/retry.ts'] },
      customGenerator: async () => briefing,
      now: () => (NOW + 200 * DAY) * 1000,
    });
    expect(later.freshness).toMatchObject({ staleCited: 2, oldestCitedAgeDays: 600 });
  });

  it('time travel: asOf is the reference time, so past briefings are not judged against today', async () => {
    const res = await executeBriefingPipeline({
      client: client(), embedder, workspaceId: 'ws', toolSelection: false,
      request: { task: 'Refactor billing', files: ['src/billing/retry.ts'], asOf: NOW - 300 * DAY },
      customGenerator: async () => briefing,
      now: () => (NOW + 5000 * DAY) * 1000,
    });
    // 300 days before NOW, DEC-002 was 100 days old, and CHAT-1 had not started yet (age clamps to 0)
    expect(res.freshness).toMatchObject({ staleCited: 0, oldestCitedAgeDays: 100 });
  });

  it('a refusal carries no freshness', async () => {
    const empty = { executeQuery: vi.fn(async () => payload([])) } as unknown as GatewayClient;
    const res = await executeBriefingPipeline({
      client: empty, embedder, workspaceId: 'ws', toolSelection: false,
      request: { task: 'x', files: ['nope.ts'] }, customGenerator: async () => briefing,
    });
    expect(res.status).not.toBe('SUCCESS'); // nothing in the graph supports the briefing: refused
    expect(res.freshness).toBeUndefined();
  });
});
