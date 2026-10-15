import type { CaseResult, EvaluationMethod, MethodSummary } from '../types.js';

export function calculateCaseResult(params: {
  caseId: string;
  method: EvaluationMethod;
  retrievedIds: string[];
  groundTruthIds: string[];
  supersededIds: string[];
  latencyMs: number;
}): CaseResult {
  const groundTruthSet = new Set(params.groundTruthIds);
  const supersededSet = new Set(params.supersededIds);

  const top1 = params.retrievedIds.slice(0, 1);
  const top3 = params.retrievedIds.slice(0, 3);
  const top5 = params.retrievedIds.slice(0, 5);

  const hitAt1 = top1.some((id) => groundTruthSet.has(id));
  const hitAt3 = top3.some((id) => groundTruthSet.has(id));
  const hitAt5 = top5.some((id) => groundTruthSet.has(id));

  let rank = 0;
  for (let i = 0; i < params.retrievedIds.length; i++) {
    if (groundTruthSet.has(params.retrievedIds[i])) {
      rank = i + 1;
      break;
    }
  }
  const reciprocalRank = rank > 0 ? 1 / rank : 0;
  const supersededHit = top5.some((id) => supersededSet.has(id));

  return {
    caseId: params.caseId,
    method: params.method,
    retrievedDecisionIds: params.retrievedIds,
    groundTruthIds: params.groundTruthIds,
    supersededIds: params.supersededIds,
    latencyMs: params.latencyMs,
    hitAt1,
    hitAt3,
    hitAt5,
    reciprocalRank,
    supersededHit,
  };
}

export function calculateSummary(
  method: EvaluationMethod,
  results: CaseResult[]
): MethodSummary {
  const n = results.length;
  if (n === 0) {
    return {
      method,
      totalCases: 0,
      recallAt1: 0,
      recallAt3: 0,
      recallAt5: 0,
      mrr: 0,
      supersededRate: 0,
      avgLatencyMs: 0,
    };
  }

  const hits1 = results.filter((r) => r.hitAt1).length;
  const hits3 = results.filter((r) => r.hitAt3).length;
  const hits5 = results.filter((r) => r.hitAt5).length;
  const supersededHits = results.filter((r) => r.supersededHit).length;

  const totalRR = results.reduce((acc, r) => acc + r.reciprocalRank, 0);
  const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);

  return {
    method,
    totalCases: n,
    recallAt1: Number((hits1 / n).toFixed(4)),
    recallAt3: Number((hits3 / n).toFixed(4)),
    recallAt5: Number((hits5 / n).toFixed(4)),
    mrr: Number((totalRR / n).toFixed(4)),
    supersededRate: Number((supersededHits / n).toFixed(4)),
    avgLatencyMs: Math.round(totalLatency / n),
  };
}
