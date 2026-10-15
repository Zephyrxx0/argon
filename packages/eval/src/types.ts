import path from 'node:path';
import { z } from 'zod';

export const RevertFixtureItemSchema = z.object({
  caseId: z.string().min(1), // e.g. "REV-001"
  workspaceId: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid workspace ID format'), // T-05-02
  revertCommitHash: z.string().min(6),
  revertSummary: z.string().min(1),
  revertedCommitHash: z.string().min(6),
  revertTimestamp: z.number().int().positive().max(2500000000), // Strict UTC epoch seconds per T-05-03
  touchedFiles: z
    .array(
      z.string().refine((p) => !p.includes('..') && !path.isAbsolute(p), {
        message: 'Touched files must be relative paths without traversal',
      })
    )
    .min(1)
    .max(100), // T-05-01 & T-05-02
  affectedComponents: z.array(z.string()).min(1),
  groundTruthDecisionIds: z.array(z.string()).min(1), // D-01
  supersededDecisionIds: z.array(z.string()).default([]),
  commitDiffSnippet: z.string(),
  description: z.string(),
});

export type RevertFixtureItem = z.infer<typeof RevertFixtureItemSchema>;

export const EvaluationMethodSchema = z.enum(['graph', 'naive-vector', 'raw-llm']);
export type EvaluationMethod = z.infer<typeof EvaluationMethodSchema>;

export const CaseResultSchema = z.object({
  caseId: z.string(),
  method: EvaluationMethodSchema,
  retrievedDecisionIds: z.array(z.string()),
  groundTruthIds: z.array(z.string()),
  supersededIds: z.array(z.string()),
  latencyMs: z.number().nonnegative(),
  hitAt1: z.boolean(),
  hitAt3: z.boolean(),
  hitAt5: z.boolean(),
  reciprocalRank: z.number().min(0).max(1),
  supersededHit: z.boolean(),
});

export type CaseResult = z.infer<typeof CaseResultSchema>;

export const MethodSummarySchema = z.object({
  method: EvaluationMethodSchema,
  totalCases: z.number().int().nonnegative(),
  recallAt1: z.number().min(0).max(1),
  recallAt3: z.number().min(0).max(1),
  recallAt5: z.number().min(0).max(1),
  mrr: z.number().min(0).max(1),
  supersededRate: z.number().min(0).max(1),
  avgLatencyMs: z.number().nonnegative(),
});

export type MethodSummary = z.infer<typeof MethodSummarySchema>;
