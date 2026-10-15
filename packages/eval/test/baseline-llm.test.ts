import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRawLlmPrompt,
  evaluateRawLlmCase,
  runRawLlmBacktest,
} from '../src/baselines/raw-llm.js';
import { loadDecisionCatalogMap } from '../src/baselines/naive-vector.js';
import { ReplayCache } from '../src/cache/replay-cache.js';
import type { RevertFixtureItem } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Baseline B: Context-Constrained Raw LLM (D-05, D-07, T-05-04, T-05-05)', () => {
  const sampleCatalog = [
    {
      id: 'DEC-001',
      title: 'Linear Retry Strategy',
      summary: 'Retries should use simple linear backoff loop.',
      embedding: new Array(512).fill(0),
    },
    {
      id: 'DEC-002',
      title: 'Mandate Exponential Jitter Backoff',
      summary: 'All retry loops must use exponential backoff with full jitter.',
      embedding: new Array(512).fill(0),
    },
  ];

  const sampleFixture: RevertFixtureItem = {
    caseId: 'REV-001',
    workspaceId: 'synthetic-demo',
    revertCommitHash: 'c42f01a',
    revertSummary: 'Revert linear retry loop in billing client due to retry storm incident',
    revertedCommitHash: 'b41e92d',
    revertTimestamp: 1718000000,
    touchedFiles: ['src/billing/retry.ts', 'src/billing/client.ts'],
    affectedComponents: ['billing-service'],
    groundTruthDecisionIds: ['DEC-002'],
    supersededDecisionIds: ['DEC-001'],
    commitDiffSnippet: '@@ -12,4 +12,4 @@\n- await exponentialJitterBackoff(attempt);\n+ await sleep(attempt * 1000);',
    description: 'Revert #42: Accidental rollback to linear backoff causes downstream payment gateway cascade failure.',
  };

  it('builds context-constrained prompt with commit metadata and catalog dump per D-07', () => {
    const prompt = buildRawLlmPrompt(sampleFixture, sampleCatalog);

    expect(prompt).toContain('Files: src/billing/retry.ts, src/billing/client.ts');
    expect(prompt).toContain('Commit summary: Revert linear retry loop in billing client');
    expect(prompt).toContain('timestamp 1718000000');
    expect(prompt).toContain('[DEC-001] Linear Retry Strategy: Retries should use simple linear backoff loop.');
    expect(prompt).toContain('[DEC-002] Mandate Exponential Jitter Backoff: All retry loops must use exponential backoff with full jitter.');
    expect(prompt).toContain('{"rankedDecisionIds": ["DEC-002", "DEC-004"]}');
  });

  it('retrieves cached response from ReplayCache without API calls', async () => {
    const tempFile = path.resolve(__dirname, 'test-temp-llm-cache.json');
    try {
      const cache = new ReplayCache(tempFile);
      const prompt = buildRawLlmPrompt(sampleFixture, sampleCatalog);

      // Seed cache with known response
      cache.set(prompt, ['DEC-001', 'DEC-002']);

      const result = await evaluateRawLlmCase(sampleFixture, sampleCatalog, cache, {
        allowLiveApi: false,
      });

      expect(result.method).toBe('raw-llm');
      expect(result.retrievedDecisionIds).toEqual(['DEC-001', 'DEC-002']);
      expect(result.hitAt1).toBe(false);
      expect(result.hitAt3).toBe(true);
      expect(result.supersededHit).toBe(true);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('falls back to deterministic catalog mock when cache misses and live API is disabled (T-05-04)', async () => {
    const cache = new ReplayCache(path.resolve(__dirname, 'empty-test-cache.json'));

    const unCachedFixture: RevertFixtureItem = {
      ...sampleFixture,
      caseId: 'REV-UNCACHED',
      revertSummary: 'Completely unique uncached summary',
    };

    const result = await evaluateRawLlmCase(unCachedFixture, sampleCatalog, cache, {
      allowLiveApi: false,
    });

    expect(result.retrievedDecisionIds).toEqual(['DEC-001', 'DEC-002']);
  });

  it('replays all 24 real fixture cases deterministically from frozen llm-cache.json fixture', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/reverts.json');
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const fixtures: RevertFixtureItem[] = JSON.parse(raw);

    const catalogMap = loadDecisionCatalogMap();
    expect(catalogMap.size).toBe(3);

    const cache = new ReplayCache();
    // Cache should already be pre-populated with all 24 fixture prompts
    expect(cache.size()).toBeGreaterThanOrEqual(24);

    const { results, summary } = await runRawLlmBacktest(
      catalogMap,
      fixtures,
      cache,
      { allowLiveApi: false }
    );

    expect(results).toHaveLength(24);
    expect(summary.totalCases).toBe(24);
    expect(summary.method).toBe('raw-llm');

    // Confirm that raw LLM baseline exhibits expected lower recall and superseded hallucinations
    expect(summary.recallAt1).toBeLessThan(0.30);
    expect(summary.supersededRate).toBeGreaterThan(0.30);
  });
});
