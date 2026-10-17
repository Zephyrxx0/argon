import { z } from 'zod';

export const ClaimItemSchema = z.object({
  claim: z.string().min(1, 'Claim text cannot be empty'),
  citedNodeIds: z
    .array(z.string().min(1))
    .min(1, 'Claims must cite at least one graph node ID'),
});
export type ClaimItem = z.infer<typeof ClaimItemSchema>;

export const AffectedComponentSchema = z.object({
  component: z.string().min(1),
  reason: z.string().min(1),
  citedNodeIds: z
    .array(z.string().min(1))
    .min(1, 'Affected components must cite at least one graph node ID'),
});
export type AffectedComponent = z.infer<typeof AffectedComponentSchema>;

export const KeyOwnerClaimSchema = z.object({
  personId: z.string().min(1),
  name: z.string().min(1),
  component: z.string().min(1),
  role: z.enum(['author', 'reviewer', 'expert']),
  authoredCount: z.number(),
  reviewedCount: z.number(),
  citedNodeIds: z
    .array(z.string().min(1))
    .min(1, 'Key owners must cite at least one graph node ID'),
});
export type KeyOwnerClaim = z.infer<typeof KeyOwnerClaimSchema>;

export const ConstrainingDecisionClaimSchema = z.object({
  decisionId: z.string().min(1),
  title: z.string().min(1),
  component: z.string().min(1),
  status: z.string().min(1),
  constraint: z.string().min(1),
  citedNodeIds: z
    .array(z.string().min(1))
    .min(1, 'Constraining decisions must cite at least one graph node ID'),
});
export type ConstrainingDecisionClaim = z.infer<typeof ConstrainingDecisionClaimSchema>;

export const PrecedentClaimSchema = z.object({
  decisionId: z.string().min(1),
  title: z.string().min(1),
  relevance: z.string().min(1),
  similarityScore: z.number().optional(),
  citedNodeIds: z
    .array(z.string().min(1))
    .min(1, 'Precedents must cite at least one graph node ID'),
});
export type PrecedentClaim = z.infer<typeof PrecedentClaimSchema>;

export const BriefingSchema = z.object({
  summary: z.object({
    overview: z.string().min(1, 'Overview cannot be empty'),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    keyTakeaways: z
      .array(ClaimItemSchema)
      .min(1, 'At least one key takeaway claim is required'),
  }),
  blastRadius: z.object({
    analysis: z.string().min(1, 'Blast radius analysis cannot be empty'),
    affectedComponents: z.array(AffectedComponentSchema),
  }),
  keyOwners: z.array(KeyOwnerClaimSchema),
  constrainingDecisions: z.array(ConstrainingDecisionClaimSchema),
  precedents: z.array(PrecedentClaimSchema),
});

export type Briefing = z.infer<typeof BriefingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Model-facing (lenient) schema + uncited-claim stripping
//
// "Uncited claims are stripped; zero verified citations triggers a refusal" is the contract.
// If the SDK enforced `citedNodeIds.min(1)` while parsing, ONE uncited bullet would reject
// an otherwise good briefing and surface as "No object generated: response did not match
// schema". So the model is asked for a lenient shape, uncited claims are removed here, and
// the strict BriefingSchema above remains the gate for everything that is shown.
// ─────────────────────────────────────────────────────────────────────────────

const lenientCites = z.array(z.string()).default([]);

export const LenientBriefingSchema = z.object({
  summary: z.object({
    overview: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    keyTakeaways: z.array(z.object({ claim: z.string(), citedNodeIds: lenientCites })),
  }),
  blastRadius: z.object({
    analysis: z.string(),
    affectedComponents: z.array(
      z.object({ component: z.string(), reason: z.string(), citedNodeIds: lenientCites })
    ),
  }),
  keyOwners: z.array(
    z.object({
      personId: z.string(),
      name: z.string(),
      component: z.string(),
      role: z.enum(['author', 'reviewer', 'expert']),
      authoredCount: z.number(),
      reviewedCount: z.number(),
      citedNodeIds: lenientCites,
    })
  ),
  constrainingDecisions: z.array(
    z.object({
      decisionId: z.string(),
      title: z.string(),
      component: z.string(),
      status: z.string(),
      constraint: z.string(),
      citedNodeIds: lenientCites,
    })
  ),
  precedents: z.array(
    z.object({
      decisionId: z.string(),
      title: z.string(),
      relevance: z.string(),
      similarityScore: z.number().optional(),
      citedNodeIds: lenientCites,
    })
  ),
});

const hasCitations = (item: unknown): boolean => {
  const ids = (item as { citedNodeIds?: unknown })?.citedNodeIds;
  return Array.isArray(ids) && ids.some((id) => typeof id === 'string' && id.trim() !== '');
};

/**
 * Removes every claim that carries no citation from raw model output (any shape; unknown
 * structure is returned untouched so the strict schema can report it). Returns the cleaned
 * object and how many claims were dropped.
 */
export function stripUncitedClaims(raw: unknown): { value: unknown; stripped: number } {
  if (!raw || typeof raw !== 'object') return { value: raw, stripped: 0 };
  const out = structuredClone(raw) as Record<string, any>;
  let stripped = 0;

  const filterArray = (holder: any, key: string) => {
    if (!holder || !Array.isArray(holder[key])) return;
    const before = holder[key].length;
    holder[key] = holder[key].filter(hasCitations);
    stripped += before - holder[key].length;
  };

  filterArray(out.summary, 'keyTakeaways');
  filterArray(out.blastRadius, 'affectedComponents');
  filterArray(out, 'keyOwners');
  filterArray(out, 'constrainingDecisions');
  filterArray(out, 'precedents');

  return { value: out, stripped };
}
