import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  formatCliTable,
  formatMarkdownTable,
  saveJsonReport,
} from '../src/reporters/formatter.js';
import type { MethodSummary, CaseResult } from '../src/types.js';

describe('Multi-target Formatter (D-13)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argon-formatter-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const mockSummaries: MethodSummary[] = [
    {
      method: 'naive-vector',
      totalCases: 24,
      recallAt1: 0.042,
      recallAt3: 0.083,
      recallAt5: 0.292,
      mrr: 0.162,
      supersededRate: 0.125,
      avgLatencyMs: 119,
    },
    {
      method: 'raw-llm',
      totalCases: 24,
      recallAt1: 0.167,
      recallAt3: 0.333,
      recallAt5: 0.417,
      mrr: 0.257,
      supersededRate: 0.542,
      avgLatencyMs: 0,
    },
    {
      method: 'graph',
      totalCases: 24,
      recallAt1: 0.833,
      recallAt3: 0.958,
      recallAt5: 0.958,
      mrr: 0.889,
      supersededRate: 0.0,
      avgLatencyMs: 6,
    },
  ];

  const mockResults: CaseResult[] = [
    {
      caseId: 'REV-001',
      method: 'graph',
      retrievedDecisionIds: ['DEC-002'],
      groundTruthIds: ['DEC-002'],
      supersededIds: ['DEC-001'],
      latencyMs: 6,
      hitAt1: true,
      hitAt3: true,
      hitAt5: true,
      reciprocalRank: 1.0,
      supersededHit: false,
    },
  ];

  it('formats ANSI/Unicode CLI table with all active methods', () => {
    const tableStr = formatCliTable(mockSummaries);
    expect(tableStr).toContain('Metric');
    expect(tableStr).toContain('Naive Vector RAG');
    expect(tableStr).toContain('Raw LLM (Gemma 4)');
    expect(tableStr).toContain('Argon (FalkorDB Graph)');
    expect(tableStr).toContain('Recall@1');
    expect(tableStr).toContain('Recall@3');
    expect(tableStr).toContain('Recall@5');
    expect(tableStr).toContain('MRR');
    expect(tableStr).toContain('Superseded Hallucinations');
    expect(tableStr).toContain('Avg Latency');
  });

  it('formats GitHub Flavored Markdown table with delta vs baseline', () => {
    const md = formatMarkdownTable(mockSummaries);
    expect(md).toContain('| Metric | Naive Vector RAG | Raw LLM (Gemma 4) | Argon (FalkorDB Graph) | Delta vs Baseline |');
    expect(md).toContain('| Recall@1 | 4.2% | 16.7% | **83.3%** | +79.1%');
    expect(md).toContain('| Superseded Hallucinations | 12.5% | 54.2% | **0.0%** | -12.5% |');
    expect(md).toContain('| Avg Latency | 119ms | 0ms | **6ms** | -113ms |');
  });

  it('saves machine-readable eval-report.json with environment metadata', () => {
    const outputPath = path.join(tempDir, 'eval-report.json');
    saveJsonReport(mockSummaries, mockResults, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.environment.nodeVersion).toBe(process.version);
    expect(parsed.summaries['graph'].recallAt1).toBe(0.833);
    expect(parsed.summaries['naive-vector'].recallAt1).toBe(0.042);
    expect(parsed.summaries['raw-llm'].recallAt1).toBe(0.167);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].caseId).toBe('REV-001');
  });
});
