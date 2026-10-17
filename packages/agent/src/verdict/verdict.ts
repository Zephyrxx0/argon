import { z } from 'zod';
import type { EvidenceBundle } from '../briefing/types.js';

/**
 * Graph-driven verdict: PROCEED / REVIEW / HOLD.
 *
 * Computed deterministically from graph facts, never by the LLM, so it cannot be
 * hallucinated and the same graph always gives the same verdict. Every reason lists the
 * graph node ids it is based on, and each rule is individually testable.
 *
 *   PROCEED  no risk signal found in the graph.
 *   REVIEW   at least one signal: get the owners/reviewers involved before merging.
 *   HOLD     a repeat-failure pattern: stop and resolve with the owners first.
 */

export const VERDICT_LEVELS = ['PROCEED', 'REVIEW', 'HOLD'] as const;
export type VerdictLevel = (typeof VERDICT_LEVELS)[number];

export const VerdictReasonSchema = z.object({
  rule: z.string().min(1),
  severity: z.enum(['info', 'review', 'hold']),
  detail: z.string().min(1),
  citedNodeIds: z.array(z.string()),
});
export type VerdictReason = z.infer<typeof VerdictReasonSchema>;

export const VerdictSchema = z.object({
  level: z.enum(VERDICT_LEVELS),
  summary: z.string().min(1),
  reasons: z.array(VerdictReasonSchema),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const VERDICT_THRESHOLDS = {
  /** Reverts on the touched files at which REVIEW becomes HOLD. */
  holdRevertCount: 2,
  /** A component this high in PageRank (1 = most central) counts as central. */
  centralRank: 3,
  /** Number of distinct downstream components that makes the blast radius "wide". */
  wideBlastComponents: 3,
} as const;

type VerdictInput = Pick<
  EvidenceBundle,
  | 'touchedFiles'
  | 'blastComponents'
  | 'constrainingDecisions'
  | 'precedents'
  | 'reverts'
  | 'riskRanking'
>;

const SEVERITY_RANK = { info: 0, review: 1, hold: 2 } as const;

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function computeVerdict(bundle: VerdictInput): Verdict {
  const reasons: VerdictReason[] = [];

  const reverts = unique((bundle.reverts ?? []).map((r) => r.id));
  const supersededPrecedents = (bundle.precedents ?? []).filter(
    (p) => (p.status ?? '').toLowerCase() === 'superseded'
  );

  // Rule 1: revert history on the very files in scope.
  if (reverts.length > 0) {
    const severity = reverts.length >= VERDICT_THRESHOLDS.holdRevertCount ? 'hold' : 'review';
    reasons.push({
      rule: 'REVERT_HISTORY',
      severity,
      detail: `${reverts.length} revert commit(s) previously touched these files.`,
      citedNodeIds: reverts,
    });
  }

  // Rule 2: the task resembles a decision the team already retired.
  if (supersededPrecedents.length > 0) {
    const escalate = reverts.length > 0;
    reasons.push({
      rule: 'SUPERSEDED_PRECEDENT',
      severity: escalate ? 'hold' : 'review',
      detail: escalate
        ? `The task closely matches superseded decision(s) ${supersededPrecedents
            .map((p) => p.decisionId)
            .join(', ')}, and this area has been reverted before: likely repeating a retired approach.`
        : `The task closely matches superseded decision(s) ${supersededPrecedents
            .map((p) => p.decisionId)
            .join(', ')}: check the replacing decision before proceeding.`,
      citedNodeIds: supersededPrecedents.map((p) => p.decisionId),
    });
  }

  // Rule 3: touching a structurally central component (PageRank over DEPENDS_ON).
  const touchedComponents = unique(
    (bundle.touchedFiles ?? []).map((f) => f.component).filter((c): c is string => Boolean(c))
  );
  const topCentral = (bundle.riskRanking ?? []).slice(0, VERDICT_THRESHOLDS.centralRank);
  const central = topCentral.filter((r) => touchedComponents.includes(r.component));
  const downstream = unique(
    (bundle.blastComponents ?? [])
      .filter((b) => b.downstreamOf)
      .map((b) => b.component)
  );
  if (central.length > 0) {
    reasons.push({
      rule: 'CENTRAL_COMPONENT',
      severity: 'review',
      detail: `${central.map((c) => c.component).join(', ')} rank${central.length === 1 ? 's' : ''} in the top ${VERDICT_THRESHOLDS.centralRank} components by PageRank over the dependency graph.`,
      citedNodeIds: central.map((c) => c.component),
    });
  }

  // Rule 4: wide downstream blast radius.
  if (downstream.length >= VERDICT_THRESHOLDS.wideBlastComponents) {
    reasons.push({
      rule: 'WIDE_BLAST_RADIUS',
      severity: 'review',
      detail: `${downstream.length} downstream components depend on this change: ${downstream.slice(0, 5).join(', ')}.`,
      citedNodeIds: downstream,
    });
  }

  // Rule 5 (informational): decisions in force that the change must respect.
  const decisions = unique((bundle.constrainingDecisions ?? []).map((d) => d.decisionId));
  if (decisions.length > 0) {
    reasons.push({
      rule: 'DECISIONS_IN_FORCE',
      severity: 'info',
      detail: `${decisions.length} decision(s) in force govern this area and the change must comply: ${decisions.slice(0, 5).join(', ')}.`,
      citedNodeIds: decisions,
    });
  }

  const top = reasons.reduce<number>((max, r) => Math.max(max, SEVERITY_RANK[r.severity]), 0);
  const level: VerdictLevel = top >= 2 ? 'HOLD' : top === 1 ? 'REVIEW' : 'PROCEED';

  const driving = reasons.filter((r) => SEVERITY_RANK[r.severity] === top && top > 0).map((r) => r.rule);
  const summary =
    level === 'PROCEED'
      ? 'No graph risk signals found for this scope.'
      : level === 'REVIEW'
        ? `Review recommended: ${driving.join(', ')}.`
        : `Hold and consult owners first: ${driving.join(', ')}.`;

  return { level, summary, reasons };
}
