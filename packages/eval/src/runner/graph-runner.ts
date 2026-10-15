import type { DirectGraphGatewayClient } from '@argon/agent';
import { calculateCaseResult, calculateSummary } from '../metrics/calculator.js';
import type { CaseResult, MethodSummary, RevertFixtureItem } from '../types.js';

export async function evaluateGraphCase(
  gateway: DirectGraphGatewayClient,
  fixture: RevertFixtureItem
): Promise<CaseResult> {
  const startTime = Date.now();

  // Execute named query 05_constraining_decisions.cypher via DirectGateway
  // Passing $asOf as UTC epoch seconds without mutating or rebuilding database per D-03
  const payload = await gateway.executeQuery(
    fixture.workspaceId,
    'constrainingDecisions',
    {
      files: fixture.touchedFiles,
      asOf: fixture.revertTimestamp,
    }
  );

  const latencyMs = Date.now() - startTime;
  const items = payload.raw ?? (payload as any).result ?? [];
  const retrievedIds = items.map((d: any) => String(d.id));

  return calculateCaseResult({
    caseId: fixture.caseId,
    method: 'graph',
    retrievedIds,
    groundTruthIds: fixture.groundTruthDecisionIds,
    supersededIds: fixture.supersededDecisionIds,
    latencyMs,
  });
}

export async function runGraphBacktest(
  gateway: DirectGraphGatewayClient,
  fixtures: RevertFixtureItem[]
): Promise<{ results: CaseResult[]; summary: MethodSummary }> {
  const results: CaseResult[] = [];
  for (const fixture of fixtures) {
    const res = await evaluateGraphCase(gateway, fixture);
    results.push(res);
  }
  const summary = calculateSummary('graph', results);
  return { results, summary };
}
