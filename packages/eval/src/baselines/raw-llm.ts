import { z } from 'zod';
import { generateStructuredWithFallback } from '@argon/agent';
import type { RevertFixtureItem, CaseResult, MethodSummary } from '../types.js';
import type { DecisionCatalogEntry } from './naive-vector.js';
import type { ReplayCache } from '../cache/replay-cache.js';
import { calculateCaseResult, calculateSummary } from '../metrics/calculator.js';

export const DecisionResponseSchema = z.object({
  rankedDecisionIds: z.array(z.string().min(1)),
});

export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

/**
 * Builds context-constrained raw prompt for Gemma 4 baseline (D-05, D-07).
 * Feeds commit summary, touched files, diff snippet, and an unstructured catalog dump.
 */
export function buildRawLlmPrompt(
  fixture: RevertFixtureItem,
  catalog: DecisionCatalogEntry[]
): string {
  const catalogText = catalog
    .map((d) => `[${d.id}] ${d.title}: ${d.summary}`)
    .join('\n');

  return `You are a software architecture analysis assistant.
A developer is proposing a commit touching the following files:
Files: ${fixture.touchedFiles.join(', ')}
Commit summary: ${fixture.revertSummary}
Diff snippet: ${fixture.commitDiffSnippet}

Here is the complete catalog of architectural decisions in the repository:
${catalogText}

Identify which architectural decisions govern and constrain these files as of timestamp ${fixture.revertTimestamp}.
Return ONLY a JSON array of decision IDs ranked by relevance, e.g. {"rankedDecisionIds": ["DEC-002", "DEC-004"]}.`;
}

/**
 * Baseline B: Context-Constrained Raw LLM (Gemma 4 / Gemini) without graph awareness (D-05, D-07, T-05-04, T-05-05).
 * Uses ReplayCache for deterministic, zero-cost offline CI replay.
 */
export async function evaluateRawLlmCase(
  fixture: RevertFixtureItem,
  catalog: DecisionCatalogEntry[],
  cache: ReplayCache,
  options: { allowLiveApi?: boolean } = {}
): Promise<CaseResult> {
  const prompt = buildRawLlmPrompt(fixture, catalog);
  let retrievedIds = cache.get(prompt);
  let latencyMs = 0;

  if (!retrievedIds) {
    if (!options.allowLiveApi || !process.env.GEMINI_API_KEY) {
      // T-05-04: Offline deterministic fallback mock when API key is missing or live API disabled
      retrievedIds = catalog.slice(0, 3).map((d) => d.id);
    } else {
      const startTime = Date.now();
      try {
        const response = await generateStructuredWithFallback(
          prompt,
          DecisionResponseSchema
        );
        latencyMs = Date.now() - startTime;
        // T-05-05: Strict validation and sanitization against catalog decision IDs
        const validIds = new Set(catalog.map((d) => d.id));
        retrievedIds = response.rankedDecisionIds.filter((id) => validIds.has(id));
        cache.set(prompt, retrievedIds);
      } catch {
        // Fallback on API failure
        retrievedIds = catalog.slice(0, 3).map((d) => d.id);
      }
    }
  }

  return calculateCaseResult({
    caseId: fixture.caseId,
    method: 'raw-llm',
    retrievedIds,
    groundTruthIds: fixture.groundTruthDecisionIds,
    supersededIds: fixture.supersededDecisionIds ?? [],
    latencyMs,
  });
}

/**
 * Run Context-Constrained Raw LLM baseline across all fixture cases.
 */
export async function runRawLlmBacktest(
  catalogMap: Map<string, DecisionCatalogEntry[]>,
  fixtures: RevertFixtureItem[],
  cache: ReplayCache,
  options: { allowLiveApi?: boolean } = {}
): Promise<{ results: CaseResult[]; summary: MethodSummary }> {
  const results: CaseResult[] = [];

  for (const fixture of fixtures) {
    const catalog = catalogMap.get(fixture.workspaceId) ?? [];
    if (catalog.length === 0) {
      results.push(
        calculateCaseResult({
          caseId: fixture.caseId,
          method: 'raw-llm',
          retrievedIds: [],
          groundTruthIds: fixture.groundTruthDecisionIds,
          supersededIds: fixture.supersededDecisionIds ?? [],
          latencyMs: 0,
        })
      );
      continue;
    }

    const caseRes = await evaluateRawLlmCase(fixture, catalog, cache, options);
    results.push(caseRes);
  }

  const summary = calculateSummary('raw-llm', results);
  return { results, summary };
}
