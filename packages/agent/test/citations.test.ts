import { describe, it, expect, vi } from 'vitest';
import { validateCitationIntegrity } from '../src/citations/validator.js';
import type { Briefing } from '../src/schemas/briefing.js';

describe('Citation Integrity Validator', () => {
  const sampleBriefing: Briefing = {
    summary: {
      overview: 'Refactoring auth',
      riskLevel: 'medium',
      keyTakeaways: [
        {
          claim: 'Touches client.ts',
          citedNodeIds: ['packages/graph/src/client.ts'],
        },
        {
          claim: 'Hallucinated claim',
          citedNodeIds: ['fake-unverified-node-id'],
        },
      ],
    },
    blastRadius: {
      analysis: 'Downstream impact',
      affectedComponents: [
        {
          component: 'apps/gateway',
          reason: 'Direct consumer',
          citedNodeIds: ['apps/gateway'],
        },
      ],
    },
    keyOwners: [
      {
        personId: 'author-alice',
        name: 'Alice',
        component: 'packages/graph',
        role: 'author',
        authoredCount: 10,
        reviewedCount: 2,
        citedNodeIds: ['author-alice'],
      },
    ],
    constrainingDecisions: [
      {
        decisionId: 'ADR-001',
        title: 'FalkorDB',
        component: 'packages/graph',
        status: 'ACCEPTED',
        constraint: 'Must use read-only queries',
        citedNodeIds: ['ADR-001'],
      },
    ],
    precedents: [],
  };

  it('passes and retains valid claims while stripping claims with unverified node IDs', async () => {
    const evidenceSet = new Set([
      'packages/graph/src/client.ts',
      'apps/gateway',
      'author-alice',
      'ADR-001',
    ]);

    const result = await validateCitationIntegrity(sampleBriefing, evidenceSet);

    expect(result.status).toBe('PASSED');
    expect(result.strippedClaimCount).toBe(1); // The hallucinated claim was stripped
    expect(result.verifiedBriefing).not.toBeNull();
    expect(result.verifiedBriefing!.summary.keyTakeaways).toHaveLength(1);
    expect(result.verifiedBriefing!.summary.keyTakeaways[0].claim).toBe(
      'Touches client.ts'
    );
    expect(result.verifiedNodeIds).toContain('packages/graph/src/client.ts');
  });

  it('uses fallback checker if ID is not in in-memory evidence set', async () => {
    const evidenceSet = new Set(['apps/gateway', 'author-alice', 'ADR-001']);
    // 'packages/graph/src/client.ts' is missing from evidenceSet, but verified by fallback
    const fallbackMock = vi.fn().mockImplementation(async (id: string) => {
      return id === 'packages/graph/src/client.ts';
    });

    const result = await validateCitationIntegrity(
      sampleBriefing,
      evidenceSet,
      fallbackMock
    );

    expect(fallbackMock).toHaveBeenCalledWith('packages/graph/src/client.ts');
    expect(result.status).toBe('PASSED');
    expect(result.verifiedNodeIds).toContain('packages/graph/src/client.ts');
  });

  it('returns CITATION_INTEGRITY_FAILURE refusal when 0 verified citations remain', async () => {
    const emptyEvidence = new Set<string>(); // No verified nodes

    const result = await validateCitationIntegrity(sampleBriefing, emptyEvidence);

    expect(result.status).toBe('CITATION_INTEGRITY_FAILURE');
    expect(result.verifiedBriefing).toBeNull();
    expect(result.failureReason).toContain('0 verified graph citations found');
  });
});

