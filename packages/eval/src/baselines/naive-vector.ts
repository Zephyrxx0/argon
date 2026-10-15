import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonEmbedder, cosineSimilarity, formatInput } from '@argon/graph';
import type { RevertFixtureItem, CaseResult, MethodSummary } from '../types.js';
import { calculateCaseResult, calculateSummary } from '../metrics/calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DecisionCatalogEntry {
  id: string;
  title: string;
  summary: string;
  embedding: number[];
}

/**
 * Load decision catalogs for all showcase workspaces from pre-computed seeds.
 */
export function loadDecisionCatalogMap(customSeedsDir?: string): Map<string, DecisionCatalogEntry[]> {
  const dir =
    customSeedsDir ??
    (fs.existsSync(path.resolve(__dirname, '../../fixtures/seeds'))
      ? path.resolve(__dirname, '../../fixtures/seeds')
      : path.resolve(process.cwd(), 'packages/eval/fixtures/seeds'));

  const catalogMap = new Map<string, DecisionCatalogEntry[]>();
  if (!fs.existsSync(dir)) {
    return catalogMap;
  }

  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'reverts.json')
    .sort();

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.workspaceId && Array.isArray(data.decisions)) {
        const catalog: DecisionCatalogEntry[] = data.decisions.map((d: any) => ({
          id: d.id,
          title: d.title,
          summary: d.summary,
          embedding: d.embedding,
        }));
        catalogMap.set(data.workspaceId, catalog);
      }
    } catch {
      // Skip invalid seed file
    }
  }

  return catalogMap;
}

/**
 * Baseline A: Naive Flat Vector Search over raw ADR text (D-05, D-06).
 * Ranks purely by cosine similarity without knowledge of component boundaries
 * or [:SUPERSEDES] temporal windows, demonstrating why flat vector RAG
 * hallucinates superseded decisions.
 */
export async function evaluateNaiveVectorCase(
  embedder: ArgonEmbedder | { embed: (text: string, isQuery?: boolean) => Promise<{ vector: number[] }> },
  catalog: DecisionCatalogEntry[],
  fixture: RevertFixtureItem
): Promise<CaseResult> {
  const startTime = Date.now();
  const rawQuery = `${fixture.revertSummary} ${fixture.touchedFiles.join(' ')}`;
  const formattedQuery = formatInput(rawQuery, true);

  const queryResult = await embedder.embed(formattedQuery, true);
  const latencyMs = Date.now() - startTime;

  // Rank purely by cosine similarity with deterministic tie-breaking (T-05-06)
  const scored = catalog.map((dec) => ({
    id: dec.id,
    score: cosineSimilarity(queryResult.vector, dec.embedding),
  }));

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const retrievedIds = scored.map((s) => s.id);

  return calculateCaseResult({
    caseId: fixture.caseId,
    method: 'naive-vector',
    retrievedIds,
    groundTruthIds: fixture.groundTruthDecisionIds,
    supersededIds: fixture.supersededDecisionIds ?? [],
    latencyMs,
  });
}

/**
 * Run Naive Vector Search across all fixture cases.
 */
export async function runNaiveVectorBacktest(
  embedder: ArgonEmbedder | { embed: (text: string, isQuery?: boolean) => Promise<{ vector: number[] }> },
  catalogMap: Map<string, DecisionCatalogEntry[]>,
  fixtures: RevertFixtureItem[]
): Promise<{ results: CaseResult[]; summary: MethodSummary }> {
  const results: CaseResult[] = [];

  for (const fixture of fixtures) {
    const catalog = catalogMap.get(fixture.workspaceId) ?? [];
    if (catalog.length === 0) {
      results.push(
        calculateCaseResult({
          caseId: fixture.caseId,
          method: 'naive-vector',
          retrievedIds: [],
          groundTruthIds: fixture.groundTruthDecisionIds,
          supersededIds: fixture.supersededDecisionIds ?? [],
          latencyMs: 0,
        })
      );
      continue;
    }

    const caseRes = await evaluateNaiveVectorCase(embedder, catalog, fixture);
    results.push(caseRes);
  }

  const summary = calculateSummary('naive-vector', results);
  return { results, summary };
}
