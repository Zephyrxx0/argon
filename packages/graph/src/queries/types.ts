import { z } from 'zod';

// ==========================================
// Cytoscape and Normalized Dual-Payload Types
// ==========================================

export interface CytoscapeNodeData {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface CytoscapeEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface CytoscapeElements {
  nodes: Array<{ data: CytoscapeNodeData }>;
  edges: Array<{ data: CytoscapeEdgeData }>;
}

export interface DualPayload<T> {
  raw: T;
  graph: CytoscapeElements;
  evidence: {
    nodeCount: number;
    edgeCount: number;
    primaryIds: string[];
  };
}

// ==========================================
// 1. Resolve Scope
// ==========================================

export const ResolveScopeParamsSchema = z.object({
  paths: z.array(z.string()).default([]),
  names: z.array(z.string()).default([]),
});
export type ResolveScopeParams = z.infer<typeof ResolveScopeParamsSchema>;

export const ResolveScopeResultSchema = z.array(
  z.object({
    matchedFiles: z.array(z.unknown()),
    allComponents: z.array(z.unknown()),
  })
);
export type ResolveScopeResult = z.infer<typeof ResolveScopeResultSchema>;

// ==========================================
// 2. Blast Radius
// ==========================================

export const BlastRadiusParamsSchema = z.object({
  files: z.array(z.string()).min(1),
  maxDepth: z.number().int().min(1).max(5).default(3),
});
export type BlastRadiusParams = z.infer<typeof BlastRadiusParamsSchema>;

export const BlastRadiusResultSchema = z.array(
  z.object({
    f: z.unknown(),
    c: z.unknown(),
    path: z.unknown().nullable().optional(),
    downstream: z.unknown().nullable().optional(),
  })
);
export type BlastRadiusResult = z.infer<typeof BlastRadiusResultSchema>;

// ==========================================
// 3. Risk Ranking
// ==========================================

export const RiskRankingParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
});
export type RiskRankingParams = z.infer<typeof RiskRankingParamsSchema>;

export const RiskRankingResultSchema = z.array(
  z.object({
    component: z.string(),
    score: z.coerce.number(),
  })
);
export type RiskRankingResult = z.infer<typeof RiskRankingResultSchema>;

// ==========================================
// 4. Who Knows
// ==========================================

export const WhoKnowsParamsSchema = z.object({
  components: z.array(z.string()).min(1),
});
export type WhoKnowsParams = z.infer<typeof WhoKnowsParamsSchema>;

export const WhoKnowsResultSchema = z.array(
  z.object({
    component: z.string(),
    authorId: z.string().nullable().optional(),
    authorName: z.string().nullable().optional(),
    authoredCount: z.coerce.number(),
    reviewerId: z.string().nullable().optional(),
    reviewerName: z.string().nullable().optional(),
    reviewedCount: z.coerce.number(),
    /** CODEOWNERS owner of record for the component (Person or Team), when one is recorded. */
    ownerId: z.string().nullable().optional(),
    ownerName: z.string().nullable().optional(),
    ownerPattern: z.string().nullable().optional(),
  })
);
export type WhoKnowsResult = z.infer<typeof WhoKnowsResultSchema>;

// ==========================================
// 5. Constraining Decisions
// ==========================================

export const ConstrainingDecisionsParamsSchema = z.object({
  files: z.array(z.string()).min(1),
  asOf: z.number().int().positive(),
});
export type ConstrainingDecisionsParams = z.infer<typeof ConstrainingDecisionsParamsSchema>;

export const ConstrainingDecisionsResultSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    component: z.string(),
    sourceUrl: z.string().nullable().optional(),
    /** Epoch (seconds, as stored) the decision took effect; drives the age/staleness signal. */
    validFrom: z.coerce.number().nullable().optional(),
    /** Where the decision was found: adr | rfc | commit | pr | doc | comment | chat. */
    sourceKind: z.string().nullable().optional(),
    /** True for invented demo data (the synthetic chat source). */
    synthetic: z.boolean().nullable().optional(),
    sourceChannel: z.string().nullable().optional(),
    // provenance (null when the decision was not extracted from a pull request)
    prId: z.string().nullable().optional(),
    prNumber: z.coerce.number().nullable().optional(),
    prUrl: z.string().nullable().optional(),
    issueId: z.string().nullable().optional(),
    issueNumber: z.coerce.number().nullable().optional(),
    issueUrl: z.string().nullable().optional(),
    issueState: z.string().nullable().optional(),
  })
);
export type ConstrainingDecisionsResult = z.infer<typeof ConstrainingDecisionsResultSchema>;

// ==========================================
// 6. Precedent Search
// ==========================================

export const PrecedentSearchParamsSchema = z.object({
  queryVector: z.array(z.number()).length(512),
  limit: z.number().int().min(1).max(50).default(5),
});
export type PrecedentSearchParams = z.infer<typeof PrecedentSearchParamsSchema>;

export const PrecedentSearchResultSchema = z.array(
  z.object({
    decision: z.unknown(),
    score: z.coerce.number(),
    component: z.unknown().nullable().optional(),
    pullRequest: z.unknown().nullable().optional(),
    /** Issue closed by the pull request the decision was extracted from, when known. */
    issue: z.unknown().nullable().optional(),
  })
);
export type PrecedentSearchResult = z.infer<typeof PrecedentSearchResultSchema>;

// ==========================================
// 7. Path Between
// ==========================================

export const PathBetweenParamsSchema = z.object({
  sourceName: z.string().min(1),
  targetName: z.string().min(1),
});
export type PathBetweenParams = z.infer<typeof PathBetweenParamsSchema>;

export const PathBetweenResultSchema = z.array(
  z.object({
    path: z.unknown(),
    pathWeight: z.coerce.number(),
  })
);
export type PathBetweenResult = z.infer<typeof PathBetweenResultSchema>;

// ==========================================
// 8. Component Overview
// ==========================================

export const ComponentOverviewParamsSchema = z.object({
  component: z.string().min(1),
});
export type ComponentOverviewParams = z.infer<typeof ComponentOverviewParamsSchema>;

export const ComponentOverviewResultSchema = z.array(
  z.object({
    name: z.string(),
    fileCount: z.coerce.number(),
    decisionCount: z.coerce.number(),
    dependencies: z.array(z.string()),
  })
);
export type ComponentOverviewResult = z.infer<typeof ComponentOverviewResultSchema>;

// ==========================================
// 9. Revert History
// ==========================================

export const RevertHistoryParamsSchema = z.object({
  files: z.array(z.string()).min(1),
  limit: z.number().int().min(1).max(100).default(20),
});
export type RevertHistoryParams = z.infer<typeof RevertHistoryParamsSchema>;

export const RevertHistoryResultSchema = z.array(
  z.object({
    node: z.unknown(),
    reverted: z.unknown().nullable().optional(),
    files: z.array(z.string()),
  })
);
export type RevertHistoryResult = z.infer<typeof RevertHistoryResultSchema>;

// ==========================================
// 10. Counterfactual Impact
// ==========================================

export const COUNTERFACTUAL_DIRECTIONS = ['DEPENDENT', 'DEPENDENCY'] as const;

export const CounterfactualImpactParamsSchema = z.object({
  /** The component that would change. */
  component: z.string().min(1),
  /** Epoch milliseconds the decisions' validity window is evaluated at. */
  asOf: z.number().int().positive(),
  maxDepth: z.number().int().min(1).max(5).default(3),
  limit: z.number().int().min(1).max(100).default(25),
});
export type CounterfactualImpactParams = z.input<typeof CounterfactualImpactParamsSchema>;

export const CounterfactualImpactResultSchema = z.array(
  z.object({
    /** The component the change is applied to (same on every row). */
    target: z.string(),
    /** An affected component. */
    component: z.string(),
    /** DEPENDENT: depends on `target`, breaks if it changes. DEPENDENCY: `target` relies on it. */
    direction: z.enum(COUNTERFACTUAL_DIRECTIONS),
    /** Shortest DEPENDS_ON distance from `target`. */
    hops: z.coerce.number(),
    /** algo.pageRank centrality of the affected component (higher = more critical). */
    score: z.coerce.number().nullable().optional(),
    /** Decisions in force at `asOf` that govern the affected component. */
    decisions: z.array(
      z.object({
        id: z.string(),
        title: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
      })
    ),
    /** CODEOWNERS owners of record of the affected component. */
    owners: z.array(
      z.object({
        id: z.string(),
        name: z.string().nullable().optional(),
        pattern: z.string().nullable().optional(),
      })
    ),
  })
);
export type CounterfactualImpactResult = z.infer<typeof CounterfactualImpactResultSchema>;
