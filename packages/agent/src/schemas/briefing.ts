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
