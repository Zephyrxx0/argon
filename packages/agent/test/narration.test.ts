import { describe, it, expect, vi } from 'vitest';
import { BriefingSchema, type Briefing } from '../src/schemas/briefing.js';
import {
  narrateBriefing,
  BriefingValidationError,
} from '../src/briefing/narrator.js';
import type { EvidenceBundle } from '../src/briefing/types.js';

describe('Gemma 4 Briefing Narrator & Schema Validation', () => {
  const validBriefing: Briefing = {
    summary: {
      overview: 'Authentication refactor touches core graph client and gateway middleware.',
      riskLevel: 'medium',
      keyTakeaways: [
        {
          claim: 'Touches client.ts which connects to FalkorDB',
          citedNodeIds: ['packages/graph/src/client.ts'],
        },
      ],
    },
    blastRadius: {
      analysis: 'Core graph client is imported directly by apps/gateway.',
      affectedComponents: [
        {
          component: 'apps/gateway',
          reason: 'Consumes ArgonGraphClient directly',
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
        authoredCount: 15,
        reviewedCount: 4,
        citedNodeIds: ['author-alice'],
      },
    ],
    constrainingDecisions: [
      {
        decisionId: 'ADR-001',
        title: 'FalkorDB Graph Storage',
        component: 'packages/graph',
        status: 'ACCEPTED',
        constraint: 'Must use read-only GRAPH.RO_QUERY for query gateway endpoints',
        citedNodeIds: ['ADR-001'],
      },
    ],
    precedents: [
      {
        decisionId: 'ADR-002',
        title: 'Connection pooling pattern',
        relevance: 'Follows established retry and timeout conventions',
        similarityScore: 0.88,
        citedNodeIds: ['ADR-002'],
      },
    ],
  };

  const dummyBundle: EvidenceBundle = {
    touchedFiles: [{ path: 'packages/graph/src/client.ts', component: 'packages/graph' }],
    blastComponents: [{ component: 'apps/gateway' }],
    keyOwners: [
      {
        personId: 'author-alice',
        name: 'Alice',
        component: 'packages/graph',
        authoredCount: 15,
        reviewedCount: 4,
      },
    ],
    constrainingDecisions: [
      {
        decisionId: 'ADR-001',
        title: 'FalkorDB Graph Storage',
        component: 'packages/graph',
        status: 'ACCEPTED',
      },
    ],
    precedents: [
      {
        decisionId: 'ADR-002',
        title: 'Connection pooling pattern',
        similarityScore: 0.88,
      },
    ],
    reverts: [],
    riskRanking: [],
    toolFindings: [],
    allNodeIds: new Set([
      'packages/graph/src/client.ts',
      'apps/gateway',
      'author-alice',
      'ADR-001',
      'ADR-002',
    ]),
    cytoscapeElements: [],
  };

  it('validates a complete, correctly cited Briefing object', () => {
    const parseResult = BriefingSchema.safeParse(validBriefing);
    expect(parseResult.success).toBe(true);
  });

  it('rejects claim items with empty citedNodeIds', () => {
    const invalid = {
      ...validBriefing,
      summary: {
        ...validBriefing.summary,
        keyTakeaways: [
          {
            claim: 'Uncited claim',
            citedNodeIds: [], // VIOLATION
          },
        ],
      },
    };

    const parseResult = BriefingSchema.safeParse(invalid);
    expect(parseResult.success).toBe(false);
  });

  it('triggers 1-step repair loop and succeeds when repaired output adheres to schema', async () => {
    const invalidFirstOutput = {
      ...validBriefing,
      summary: {
        ...validBriefing.summary,
        keyTakeaways: [
          {
            claim: 'Claim without citations',
            citedNodeIds: [], // Invalid first try
          },
        ],
      },
    };

    const generatorMock = vi
      .fn()
      .mockResolvedValueOnce(invalidFirstOutput)
      .mockResolvedValueOnce(validBriefing);

    const result = await narrateBriefing('Refactor client auth', dummyBundle, {
      customGenerator: generatorMock,
    });

    expect(generatorMock).toHaveBeenCalledTimes(2);
    expect(result.summary.riskLevel).toBe('medium');
    expect(result.summary.keyTakeaways[0].citedNodeIds).toEqual([
      'packages/graph/src/client.ts',
    ]);
  });

  it('throws BriefingValidationError after exactly 1 failed repair attempt', async () => {
    const invalidOutput = {
      ...validBriefing,
      summary: {
        ...validBriefing.summary,
        keyTakeaways: [
          {
            claim: 'Still invalid claim',
            citedNodeIds: [],
          },
        ],
      },
    };

    const generatorMock = vi
      .fn()
      .mockResolvedValueOnce(invalidOutput)
      .mockResolvedValueOnce(invalidOutput);

    await expect(
      narrateBriefing('Refactor client auth', dummyBundle, {
        customGenerator: generatorMock,
      })
    ).rejects.toThrow(BriefingValidationError);

    expect(generatorMock).toHaveBeenCalledTimes(2);
  });
});

