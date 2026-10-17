import { describe, it, expect } from 'vitest';
import { narrateBriefing, BriefingValidationError } from '../src/briefing/narrator.js';
import { stripUncitedClaims, BriefingSchema, LenientBriefingSchema } from '../src/schemas/briefing.js';
import type { EvidenceBundle } from '../src/briefing/types.js';

const bundle: EvidenceBundle = {
  touchedFiles: [{ path: 'lib/utils.ts', component: 'lib' }],
  blastComponents: [{ component: 'lib' }],
  keyOwners: [],
  constrainingDecisions: [],
  precedents: [],
} as unknown as EvidenceBundle;

const base = () => ({
  summary: {
    overview: 'Overview',
    riskLevel: 'low',
    keyTakeaways: [
      { claim: 'cited claim', citedNodeIds: ['lib/utils.ts'] },
      { claim: 'uncited claim', citedNodeIds: [] },
      { claim: 'blank-cite claim', citedNodeIds: ['  '] },
    ],
  },
  blastRadius: {
    analysis: 'Analysis',
    affectedComponents: [
      { component: 'lib', reason: 'r', citedNodeIds: ['lib'] },
      { component: 'ghost', reason: 'r', citedNodeIds: [] },
    ],
  },
  keyOwners: [],
  constrainingDecisions: [],
  precedents: [],
});

describe('uncited claim stripping', () => {
  it('removes uncited/blank-cited claims across all claim arrays and counts them', () => {
    const { value, stripped } = stripUncitedClaims(base());
    expect(stripped).toBe(3);
    const v = value as ReturnType<typeof base>;
    expect(v.summary.keyTakeaways.map((c) => c.claim)).toEqual(['cited claim']);
    expect(v.blastRadius.affectedComponents.map((c) => c.component)).toEqual(['lib']);
  });

  it('does not mutate the input and tolerates non-objects', () => {
    const input = base();
    stripUncitedClaims(input);
    expect(input.summary.keyTakeaways).toHaveLength(3);
    expect(stripUncitedClaims(null)).toEqual({ value: null, stripped: 0 });
    expect(stripUncitedClaims('x')).toEqual({ value: 'x', stripped: 0 });
  });

  it('lenient schema accepts what the strict schema rejects; stripped output passes strict', () => {
    expect(BriefingSchema.safeParse(base()).success).toBe(false);
    expect(LenientBriefingSchema.safeParse(base()).success).toBe(true);
    expect(BriefingSchema.safeParse(stripUncitedClaims(base()).value).success).toBe(true);
  });

  it('narrateBriefing returns a briefing with the uncited claims removed instead of failing', async () => {
    const result = await narrateBriefing('task', bundle, { customGenerator: async () => base() });
    expect(result.summary.keyTakeaways.map((c) => c.claim)).toEqual(['cited claim']);
    expect(result.blastRadius.affectedComponents).toHaveLength(1);
  });

  it('still fails closed when nothing is cited at all', async () => {
    const allUncited = base();
    allUncited.summary.keyTakeaways = [{ claim: 'x', citedNodeIds: [] }];
    await expect(
      narrateBriefing('task', bundle, { customGenerator: async () => allUncited })
    ).rejects.toBeInstanceOf(BriefingValidationError);
  });
});
