import { describe, it, expect } from 'vitest';
import { computeVerdict, VerdictSchema, VERDICT_THRESHOLDS } from '../src/verdict/verdict.js';
import type { EvidenceBundle } from '../src/briefing/types.js';

type Input = Parameters<typeof computeVerdict>[0];

const empty = (): Input => ({
  touchedFiles: [],
  blastComponents: [],
  constrainingDecisions: [],
  precedents: [],
  reverts: [],
  riskRanking: [],
});

const rev = (id: string) => ({ id, files: ['src/a.ts'] });

describe('computeVerdict (deterministic, graph-driven)', () => {
  it('PROCEED when the graph shows no risk signals', () => {
    const v = computeVerdict(empty());
    expect(v.level).toBe('PROCEED');
    expect(v.reasons).toEqual([]);
    expect(v.summary).toMatch(/No graph risk signals/);
  });

  it('decisions in force alone are informational and do not raise the level', () => {
    const v = computeVerdict({
      ...empty(),
      constrainingDecisions: [
        { decisionId: 'D-2', title: 'x', component: 'billing', status: 'active' },
      ],
    });
    expect(v.level).toBe('PROCEED');
    expect(v.reasons).toHaveLength(1);
    expect(v.reasons[0]).toMatchObject({ rule: 'DECISIONS_IN_FORCE', severity: 'info', citedNodeIds: ['D-2'] });
  });

  it('REVIEW on a single revert touching the scope, citing the revert node', () => {
    const v = computeVerdict({ ...empty(), reverts: [rev('pr_rev1')] });
    expect(v.level).toBe('REVIEW');
    expect(v.reasons[0]).toMatchObject({ rule: 'REVERT_HISTORY', severity: 'review', citedNodeIds: ['pr_rev1'] });
  });

  it(`HOLD from ${VERDICT_THRESHOLDS.holdRevertCount} distinct reverts; duplicates of the same revert do not count twice`, () => {
    expect(computeVerdict({ ...empty(), reverts: [rev('a'), rev('a')] }).level).toBe('REVIEW');
    const v = computeVerdict({ ...empty(), reverts: [rev('a'), rev('b')] });
    expect(v.level).toBe('HOLD');
    expect(v.summary).toMatch(/^Hold/);
    expect(v.reasons[0]!.citedNodeIds).toEqual(['a', 'b']);
  });

  it('REVIEW when the task resembles a superseded decision', () => {
    const v = computeVerdict({
      ...empty(),
      precedents: [{ decisionId: 'DEC-001', title: 'Linear retry', similarityScore: 0.9, status: 'superseded' }],
    });
    expect(v.level).toBe('REVIEW');
    expect(v.reasons[0]).toMatchObject({ rule: 'SUPERSEDED_PRECEDENT', severity: 'review', citedNodeIds: ['DEC-001'] });
  });

  it('active precedents do not trigger the superseded rule; status match is case-insensitive', () => {
    const active = computeVerdict({
      ...empty(),
      precedents: [{ decisionId: 'D', title: 't', similarityScore: 0.9, status: 'active' }],
    });
    expect(active.level).toBe('PROCEED');
    const upper = computeVerdict({
      ...empty(),
      precedents: [{ decisionId: 'D', title: 't', similarityScore: 0.9, status: 'SUPERSEDED' }],
    });
    expect(upper.level).toBe('REVIEW');
  });

  it('escalates to HOLD when a superseded precedent coincides with revert history', () => {
    const v = computeVerdict({
      ...empty(),
      reverts: [rev('pr_rev1')],
      precedents: [{ decisionId: 'DEC-001', title: 'Linear retry', similarityScore: 0.9, status: 'superseded' }],
    });
    expect(v.level).toBe('HOLD');
    const rules = v.reasons.map((r) => `${r.rule}:${r.severity}`);
    expect(rules).toContain('REVERT_HISTORY:review');
    expect(rules).toContain('SUPERSEDED_PRECEDENT:hold');
  });

  it('REVIEW when a touched component is in the PageRank top 3', () => {
    const v = computeVerdict({
      ...empty(),
      touchedFiles: [{ path: 'src/db.ts', component: 'Database' }],
      riskRanking: [
        { component: 'Storage', score: 0.5 },
        { component: 'Database', score: 0.3 },
        { component: 'Auth', score: 0.1 },
      ],
    });
    expect(v.level).toBe('REVIEW');
    expect(v.reasons[0]).toMatchObject({ rule: 'CENTRAL_COMPONENT', citedNodeIds: ['Database'] });
  });

  it('does not flag a touched component ranked below the top 3 or an untouched central one', () => {
    const ranking = [
      { component: 'A', score: 4 },
      { component: 'B', score: 3 },
      { component: 'C', score: 2 },
      { component: 'D', score: 1 },
    ];
    expect(
      computeVerdict({ ...empty(), touchedFiles: [{ path: 'd.ts', component: 'D' }], riskRanking: ranking }).level
    ).toBe('PROCEED');
    expect(
      computeVerdict({ ...empty(), touchedFiles: [{ path: 'z.ts', component: 'Z' }], riskRanking: ranking }).level
    ).toBe('PROCEED');
  });

  it('REVIEW on a wide blast radius, counting only distinct downstream components', () => {
    const wide = computeVerdict({
      ...empty(),
      blastComponents: ['x', 'y', 'z'].map((c) => ({ component: c, downstreamOf: 'billing' })),
    });
    expect(wide.level).toBe('REVIEW');
    expect(wide.reasons[0]).toMatchObject({ rule: 'WIDE_BLAST_RADIUS' });

    const narrow = computeVerdict({
      ...empty(),
      blastComponents: [
        { component: 'x', downstreamOf: 'billing' },
        { component: 'x', downstreamOf: 'auth' },
        { component: 'y', downstreamOf: 'billing' },
        // scope fallback entries (no downstreamOf) are not downstream components
        { component: 'billing' },
      ],
    });
    expect(narrow.level).toBe('PROCEED');
  });

  it('takes the maximum severity across rules and is deterministic', () => {
    const input: Input = {
      ...empty(),
      reverts: [rev('a'), rev('b')],
      constrainingDecisions: [{ decisionId: 'D-2', title: 't', component: 'c', status: 'active' }],
      blastComponents: ['x', 'y', 'z'].map((c) => ({ component: c, downstreamOf: 'c' })),
    };
    const first = computeVerdict(input);
    const second = computeVerdict(structuredClone(input));
    expect(first).toEqual(second);
    expect(first.level).toBe('HOLD');
    expect(first.reasons.map((r) => r.rule)).toEqual(['REVERT_HISTORY', 'WIDE_BLAST_RADIUS', 'DECISIONS_IN_FORCE']);
  });

  it('always yields output that satisfies VerdictSchema', () => {
    const bundleLike: Pick<EvidenceBundle, 'reverts'> = { reverts: [rev('r')] };
    const v = computeVerdict({ ...empty(), ...bundleLike });
    expect(VerdictSchema.safeParse(v).success).toBe(true);
    expect(VerdictSchema.safeParse({ ...v, level: 'MAYBE' }).success).toBe(false);
  });
});
