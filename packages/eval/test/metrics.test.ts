import { describe, it, expect } from 'vitest';
import {
  calculateCaseResult,
  calculateSummary,
} from '../src/metrics/calculator.js';
import type { CaseResult } from '../src/types.js';

describe('metrics calculator', () => {
  describe('calculateCaseResult', () => {
    it('computes top-1 hit correctly', () => {
      const res = calculateCaseResult({
        caseId: 'REV-001',
        method: 'graph',
        retrievedIds: ['DEC-002', 'DEC-003', 'DEC-004'],
        groundTruthIds: ['DEC-002'],
        supersededIds: ['DEC-001'],
        latencyMs: 12,
      });

      expect(res.hitAt1).toBe(true);
      expect(res.hitAt3).toBe(true);
      expect(res.hitAt5).toBe(true);
      expect(res.reciprocalRank).toBe(1.0);
      expect(res.supersededHit).toBe(false);
    });

    it('computes rank 3 hit correctly', () => {
      const res = calculateCaseResult({
        caseId: 'REV-002',
        method: 'graph',
        retrievedIds: ['DEC-010', 'DEC-011', 'DEC-004', 'DEC-012'],
        groundTruthIds: ['DEC-004'],
        supersededIds: ['DEC-003'],
        latencyMs: 18,
      });

      expect(res.hitAt1).toBe(false);
      expect(res.hitAt3).toBe(true);
      expect(res.hitAt5).toBe(true);
      expect(res.reciprocalRank).toBeCloseTo(1 / 3, 4);
      expect(res.supersededHit).toBe(false);
    });

    it('computes rank 5 hit correctly', () => {
      const res = calculateCaseResult({
        caseId: 'REV-003',
        method: 'naive-vector',
        retrievedIds: ['DEC-010', 'DEC-011', 'DEC-012', 'DEC-013', 'DEC-006'],
        groundTruthIds: ['DEC-006'],
        supersededIds: [],
        latencyMs: 25,
      });

      expect(res.hitAt1).toBe(false);
      expect(res.hitAt3).toBe(false);
      expect(res.hitAt5).toBe(true);
      expect(res.reciprocalRank).toBe(0.2);
      expect(res.supersededHit).toBe(false);
    });

    it('handles no hit (beyond top 5 or not found)', () => {
      const res = calculateCaseResult({
        caseId: 'REV-004',
        method: 'raw-llm',
        retrievedIds: ['DEC-099', 'DEC-098'],
        groundTruthIds: ['DEC-008'],
        supersededIds: ['DEC-007'],
        latencyMs: 150,
      });

      expect(res.hitAt1).toBe(false);
      expect(res.hitAt3).toBe(false);
      expect(res.hitAt5).toBe(false);
      expect(res.reciprocalRank).toBe(0);
      expect(res.supersededHit).toBe(false);
    });

    it('detects superseded decision contamination within top 5', () => {
      const res = calculateCaseResult({
        caseId: 'REV-001',
        method: 'naive-vector',
        retrievedIds: ['DEC-001', 'DEC-099', 'DEC-002'], // DEC-001 is superseded
        groundTruthIds: ['DEC-002'],
        supersededIds: ['DEC-001'],
        latencyMs: 30,
      });

      expect(res.hitAt1).toBe(false);
      expect(res.hitAt3).toBe(true);
      expect(res.supersededHit).toBe(true);
      expect(res.reciprocalRank).toBeCloseTo(1 / 3, 4);
    });

    it('picks the earliest rank when multiple ground truth IDs exist', () => {
      const res = calculateCaseResult({
        caseId: 'REV-005',
        method: 'graph',
        retrievedIds: ['DEC-A', 'DEC-B', 'DEC-C'],
        groundTruthIds: ['DEC-B', 'DEC-C'],
        supersededIds: [],
        latencyMs: 10,
      });

      expect(res.hitAt1).toBe(false);
      expect(res.hitAt3).toBe(true);
      expect(res.reciprocalRank).toBe(0.5); // rank 2
    });
  });

  describe('calculateSummary', () => {
    it('handles empty results array safely without NaN or division by zero', () => {
      const summary = calculateSummary('graph', []);

      expect(summary).toEqual({
        method: 'graph',
        totalCases: 0,
        recallAt1: 0,
        recallAt3: 0,
        recallAt5: 0,
        mrr: 0,
        supersededRate: 0,
        avgLatencyMs: 0,
      });
    });

    it('aggregates multiple case results into accurate summary statistics', () => {
      const results: CaseResult[] = [
        {
          caseId: 'REV-001',
          method: 'graph',
          retrievedDecisionIds: ['DEC-001'],
          groundTruthIds: ['DEC-001'],
          supersededIds: [],
          latencyMs: 10,
          hitAt1: true,
          hitAt3: true,
          hitAt5: true,
          reciprocalRank: 1.0,
          supersededHit: false,
        },
        {
          caseId: 'REV-002',
          method: 'graph',
          retrievedDecisionIds: ['X', 'DEC-002'],
          groundTruthIds: ['DEC-002'],
          supersededIds: [],
          latencyMs: 20,
          hitAt1: false,
          hitAt3: true,
          hitAt5: true,
          reciprocalRank: 0.5,
          supersededHit: false,
        },
        {
          caseId: 'REV-003',
          method: 'graph',
          retrievedDecisionIds: ['X', 'Y', 'Z'],
          groundTruthIds: ['DEC-003'],
          supersededIds: ['OLD-003'],
          latencyMs: 30,
          hitAt1: false,
          hitAt3: false,
          hitAt5: false,
          reciprocalRank: 0.0,
          supersededHit: false,
        },
        {
          caseId: 'REV-004',
          method: 'graph',
          retrievedDecisionIds: ['OLD-004', 'X', 'Y', 'Z', 'DEC-004'],
          groundTruthIds: ['DEC-004'],
          supersededIds: ['OLD-004'],
          latencyMs: 40,
          hitAt1: false,
          hitAt3: false,
          hitAt5: true,
          reciprocalRank: 0.2,
          supersededHit: true,
        },
      ];

      const summary = calculateSummary('graph', results);

      expect(summary.totalCases).toBe(4);
      expect(summary.recallAt1).toBe(0.25); // 1 / 4
      expect(summary.recallAt3).toBe(0.5); // 2 / 4
      expect(summary.recallAt5).toBe(0.75); // 3 / 4
      // MRR: (1.0 + 0.5 + 0.0 + 0.2) / 4 = 1.7 / 4 = 0.425
      expect(summary.mrr).toBe(0.425);
      // Superseded rate: 1 / 4 = 0.25
      expect(summary.supersededRate).toBe(0.25);
      // Latency: (10 + 20 + 30 + 40) / 4 = 25
      expect(summary.avgLatencyMs).toBe(25);
    });
  });
});
