import fs from 'node:fs';
import path from 'node:path';
import Table from 'cli-table3';
import picocolors from 'picocolors';
import type { MethodSummary, CaseResult, EvaluationMethod } from '../types.js';

export interface EvalReportJson {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    totalCases: number;
  };
  summaries: Record<EvaluationMethod, MethodSummary | undefined>;
  results: CaseResult[];
}

/**
 * Format benchmark summaries into colored ANSI/Unicode terminal table per D-13.
 */
export function formatCliTable(summaries: MethodSummary[]): string {
  const methodHeaders: Record<EvaluationMethod, string> = {
    'naive-vector': picocolors.yellow('Naive Vector RAG'),
    'raw-llm': picocolors.magenta('Raw LLM (Gemma 4)'),
    graph: picocolors.green('Argon (FalkorDB Graph)'),
  };

  const activeMethods = summaries.map((s) => s.method);
  const head = [picocolors.cyan('Metric'), ...activeMethods.map((m) => methodHeaders[m])];

  const table = new Table({
    head,
    style: { head: [], border: [] },
  });

  const getRow = (label: string, fn: (s: MethodSummary) => string) => {
    return [
      label,
      ...summaries.map((s) => {
        const val = fn(s);
        if (s.method === 'graph') {
          return picocolors.bold(picocolors.green(val));
        }
        return val;
      }),
    ];
  };

  table.push(
    getRow('Total Cases', (s) => String(s.totalCases)),
    getRow('Recall@1', (s) => `${(s.recallAt1 * 100).toFixed(1)}%`),
    getRow('Recall@3', (s) => `${(s.recallAt3 * 100).toFixed(1)}%`),
    getRow('Recall@5', (s) => `${(s.recallAt5 * 100).toFixed(1)}%`),
    getRow('MRR', (s) => s.mrr.toFixed(3)),
    getRow('Superseded Hallucinations', (s) =>
      s.supersededRate === 0
        ? picocolors.green('0.0% (Clean)')
        : picocolors.red(`${(s.supersededRate * 100).toFixed(1)}%`)
    ),
    getRow('Avg Latency', (s) => `${s.avgLatencyMs}ms`)
  );

  return table.toString();
}

/**
 * Format comparative summaries into GitHub Flavored Markdown table per D-13.
 * Ready to paste into README.md and docs/BLOG-POST.md.
 */
export function formatMarkdownTable(summaries: MethodSummary[]): string {
  const nv = summaries.find((s) => s.method === 'naive-vector');
  const llm = summaries.find((s) => s.method === 'raw-llm');
  const gr = summaries.find((s) => s.method === 'graph');

  const deltaPct = (grVal?: number, baseVal?: number) => {
    if (grVal === undefined || baseVal === undefined) return 'N/A';
    const diff = grVal - baseVal;
    return diff >= 0 ? `+${(diff * 100).toFixed(1)}%` : `${(diff * 100).toFixed(1)}%`;
  };

  const deltaMrr = (grVal?: number, baseVal?: number) => {
    if (grVal === undefined || baseVal === undefined) return 'N/A';
    const diff = grVal - baseVal;
    return diff >= 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
  };

  const deltaSuperseded = (grVal?: number, baseVal?: number) => {
    if (grVal === undefined || baseVal === undefined) return 'N/A';
    const diff = grVal - baseVal;
    return diff <= 0 ? `${(diff * 100).toFixed(1)}%` : `+${(diff * 100).toFixed(1)}%`;
  };

  const fmtPct = (val?: number) => (val !== undefined ? `${(val * 100).toFixed(1)}%` : 'N/A');
  const fmtMrr = (val?: number) => (val !== undefined ? val.toFixed(3) : 'N/A');

  return `| Metric | Naive Vector RAG | Raw LLM (Gemma 4) | Argon (FalkorDB Graph) | Delta vs Baseline |
|---|---|---|---|---|
| Recall@1 | ${fmtPct(nv?.recallAt1)} | ${fmtPct(llm?.recallAt1)} | **${fmtPct(gr?.recallAt1)}** | ${deltaPct(gr?.recallAt1, nv?.recallAt1)} |
| Recall@3 | ${fmtPct(nv?.recallAt3)} | ${fmtPct(llm?.recallAt3)} | **${fmtPct(gr?.recallAt3)}** | ${deltaPct(gr?.recallAt3, nv?.recallAt3)} |
| Recall@5 | ${fmtPct(nv?.recallAt5)} | ${fmtPct(llm?.recallAt5)} | **${fmtPct(gr?.recallAt5)}** | ${deltaPct(gr?.recallAt5, nv?.recallAt5)} |
| MRR | ${fmtMrr(nv?.mrr)} | ${fmtMrr(llm?.mrr)} | **${fmtMrr(gr?.mrr)}** | ${deltaMrr(gr?.mrr, nv?.mrr)} |
| Superseded Hallucinations | ${fmtPct(nv?.supersededRate)} | ${fmtPct(llm?.supersededRate)} | **${fmtPct(gr?.supersededRate)}** | ${deltaSuperseded(gr?.supersededRate, nv?.supersededRate)} |
| Avg Latency | ${nv?.avgLatencyMs ?? 0}ms | ${llm?.avgLatencyMs ?? 0}ms | **${gr?.avgLatencyMs ?? 0}ms** | -${Math.max(0, (nv?.avgLatencyMs ?? 0) - (gr?.avgLatencyMs ?? 0))}ms |`;
}

/**
 * Save multi-method evaluation report to machine-readable JSON per D-13.
 */
export function saveJsonReport(
  summaries: MethodSummary[],
  results: CaseResult[],
  outputPath?: string
): void {
  const dest = outputPath ?? path.resolve(process.cwd(), 'eval-report.json');
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const summariesByMethod: Record<string, MethodSummary> = {};
  for (const s of summaries) {
    summariesByMethod[s.method] = s;
  }

  const payload: EvalReportJson = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      totalCases: results.length,
    },
    summaries: summariesByMethod as any,
    results,
  };

  fs.writeFileSync(dest, JSON.stringify(payload, null, 2), 'utf-8');
}
