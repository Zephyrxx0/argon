import { describe, it, expect } from 'vitest';
import {
  evaluateNaiveVectorCase,
  runNaiveVectorBacktest,
  type DecisionCatalogEntry,
} from '../src/baselines/naive-vector.js';
import type { RevertFixtureItem } from '../src/types.js';

describe('Baseline A: Naive Flat Vector Search (D-05, D-06, T-05-06)', () => {
  // Helper to construct normalized 512-d unit vector along a specific axis
  const makeVector = (activeAxis: number): number[] => {
    const v = new Array(512).fill(0);
    v[activeAxis] = 1.0;
    return v;
  };

  it('ranks decisions purely by cosine similarity, demonstrating superseded hallucination flaw', async () => {
    // Model query vector aligned with axis 0
    const mockEmbedder = {
      embed: async () => ({ vector: makeVector(0) }),
    };

    // DEC-001 (superseded linear retry) is closely aligned with query (axis 0, dot = 0.95)
    // DEC-002 (active exponential jitter) is less lexically aligned (axis 1, dot = 0.40)
    // DEC-003 (unrelated auth) is orthogonal (axis 2, dot = 0.0)
    const catalog: DecisionCatalogEntry[] = [
      {
        id: 'DEC-002',
        title: 'Mandate Exponential Jitter Backoff',
        summary: 'All retry loops must use exponential backoff with full jitter.',
        embedding: (() => {
          const v = new Array(512).fill(0);
          v[0] = 0.4;
          v[1] = Math.sqrt(1 - 0.4 * 0.4);
          return v;
        })(),
      },
      {
        id: 'DEC-001',
        title: 'Linear Retry Strategy',
        summary: 'Retries should use simple linear backoff loop.',
        embedding: (() => {
          const v = new Array(512).fill(0);
          v[0] = 0.95;
          v[1] = Math.sqrt(1 - 0.95 * 0.95);
          return v;
        })(),
      },
      {
        id: 'DEC-003',
        title: 'JWT Authentication',
        summary: 'Short lived JWT tokens.',
        embedding: makeVector(2),
      },
    ];

    const fixture: RevertFixtureItem = {
      caseId: 'REV-001',
      workspaceId: 'synthetic-demo',
      revertCommitHash: 'c42f01a',
      revertSummary: 'Revert linear retry loop in billing client',
      revertedCommitHash: 'b41e92d',
      revertTimestamp: 1718000000,
      touchedFiles: ['src/billing/retry.ts'],
      affectedComponents: ['billing-service'],
      groundTruthDecisionIds: ['DEC-002'],
      supersededDecisionIds: ['DEC-001'],
      commitDiffSnippet: '- exponentialJitter(); + linearSleep();',
      description: 'Revert #42 accidental rollback to linear backoff',
    };

    const result = await evaluateNaiveVectorCase(mockEmbedder, catalog, fixture);

    // Vector RAG ranks DEC-001 (superseded) at rank 1 due to higher lexical similarity!
    expect(result.retrievedDecisionIds[0]).toBe('DEC-001');
    expect(result.retrievedDecisionIds[1]).toBe('DEC-002');
    expect(result.hitAt1).toBe(false); // Missed ground truth at rank 1
    expect(result.hitAt3).toBe(true);  // Ground truth DEC-002 is at rank 2
    expect(result.reciprocalRank).toBe(0.5);
    expect(result.supersededHit).toBe(true); // Hallucinated superseded decision in top results!
  });

  it('performs deterministic alphanumeric tie-breaking on identical cosine scores (T-05-06)', async () => {
    const mockEmbedder = {
      embed: async () => ({ vector: makeVector(0) }),
    };

    // Both DEC-B and DEC-A have identical cosine similarity
    const catalog: DecisionCatalogEntry[] = [
      {
        id: 'DEC-Z',
        title: 'Decision Z',
        summary: 'Z',
        embedding: makeVector(5), // similarity 0
      },
      {
        id: 'DEC-B',
        title: 'Decision B',
        summary: 'B',
        embedding: makeVector(0), // similarity 1.0
      },
      {
        id: 'DEC-A',
        title: 'Decision A',
        summary: 'A',
        embedding: makeVector(0), // similarity 1.0
      },
    ];

    const fixture: RevertFixtureItem = {
      caseId: 'REV-TIE',
      workspaceId: 'synthetic-demo',
      revertCommitHash: '111111',
      revertSummary: 'Tie breaking test',
      revertedCommitHash: '222222',
      revertTimestamp: 1718000000,
      touchedFiles: ['src/file.ts'],
      affectedComponents: ['comp'],
      groundTruthDecisionIds: ['DEC-A'],
      supersededDecisionIds: [],
      commitDiffSnippet: 'diff',
      description: 'Tie break',
    };

    const result = await evaluateNaiveVectorCase(mockEmbedder, catalog, fixture);
    // On identical score (1.0), DEC-A must sort before DEC-B alphabetically
    expect(result.retrievedDecisionIds.slice(0, 2)).toEqual(['DEC-A', 'DEC-B']);
  });

  it('runs full naive vector backtest over multiple fixtures and computes summary', async () => {
    const mockEmbedder = {
      embed: async () => ({ vector: makeVector(0) }),
    };

    const catalog: DecisionCatalogEntry[] = [
      { id: 'DEC-001', title: 'Dec 1', summary: 'Sum 1', embedding: makeVector(0) },
      { id: 'DEC-002', title: 'Dec 2', summary: 'Sum 2', embedding: makeVector(1) },
    ];

    const catalogMap = new Map<string, DecisionCatalogEntry[]>([
      ['ws-1', catalog],
    ]);

    const fixtures: RevertFixtureItem[] = [
      {
        caseId: 'CASE-1',
        workspaceId: 'ws-1',
        revertCommitHash: 'c11111',
        revertSummary: 'Summary 1',
        revertedCommitHash: 'b11111',
        revertTimestamp: 1718000000,
        touchedFiles: ['src/a.ts'],
        affectedComponents: ['comp-a'],
        groundTruthDecisionIds: ['DEC-001'],
        supersededDecisionIds: [],
        commitDiffSnippet: 'diff 1',
        description: 'Desc 1',
      },
      {
        caseId: 'CASE-2',
        workspaceId: 'ws-1',
        revertCommitHash: 'c22222',
        revertSummary: 'Summary 2',
        revertedCommitHash: 'b22222',
        revertTimestamp: 1718100000,
        touchedFiles: ['src/b.ts'],
        affectedComponents: ['comp-b'],
        groundTruthDecisionIds: ['DEC-002'],
        supersededDecisionIds: ['DEC-001'],
        commitDiffSnippet: 'diff 2',
        description: 'Desc 2',
      },
    ];

    const { results, summary } = await runNaiveVectorBacktest(mockEmbedder, catalogMap, fixtures);

    expect(results).toHaveLength(2);
    expect(summary.totalCases).toBe(2);
    expect(summary.method).toBe('naive-vector');
    // Case 1: GT DEC-001 is rank 1 (hit@1 = true)
    // Case 2: GT DEC-002 is rank 2 (hit@1 = false, hit@3 = true, superseded DEC-001 hit = true)
    expect(summary.recallAt1).toBe(0.5);
    expect(summary.recallAt3).toBe(1.0);
    expect(summary.mrr).toBe(0.75); // (1.0 + 0.5) / 2
    expect(summary.supersededRate).toBe(0.5);
  });
});
