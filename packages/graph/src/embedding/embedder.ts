import fs from 'node:fs';
import path from 'node:path';
import { pipeline, env } from '@huggingface/transformers';
import { GoogleGenAI } from '@google/genai';
import type { EmbedderConfig, EmbeddingProvider, EmbedResult } from './types';

/**
 * Where the ONNX model lives (D-14: .cache/models). A cwd-relative cache meant every process
 * (web, gateway, ingest CLI, tests...) downloaded its own ~850 MB copy on first use, and a
 * half-finished download made embedding fail. Resolve ONE shared cache instead:
 *   1. TRANSFORMERS_CACHE, if set
 *   2. <monorepo root>/.cache/models (found via pnpm-workspace.yaml, walking up from cwd)
 *   3. <cwd>/.cache/models
 */
export function resolveModelCacheDir(
  cwd: string = process.cwd(),
  envVars: NodeJS.ProcessEnv = process.env
): string {
  if (envVars.TRANSFORMERS_CACHE) return envVars.TRANSFORMERS_CACHE;
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return path.join(dir, '.cache', 'models');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(cwd, '.cache/models');
}

env.cacheDir = resolveModelCacheDir();

/**
 * Format input string with required task-specific prefixes for EmbeddingGemma-2.
 * Conforms to PRD §9.4:
 * Queries: `task: search result | query: ...`
 * Documents: `title: ... | text: ...`
 */
export function formatInput(text: string, isQuery = false, title?: string): string {
  if (isQuery) {
    return `task: search result | query: ${text}`;
  }
  return `title: ${title ?? 'Document'} | text: ${text}`;
}

/**
 * Slice embeddings to target dimensionality (512-d MRL) and strictly re-normalize using L2 norm.
 * Conforms to PRD §9.4 & DECISIONS.md §2.2 / D-16.
 */
export function processMatryoshkaVector(
  rawFloats: number[] | Float32Array,
  targetDim = 512
): number[] {
  let sliced = Array.from(rawFloats.slice(0, targetDim));
  if (sliced.length < targetDim) {
    sliced = sliced.concat(new Array(targetDim - sliced.length).fill(0));
  }
  const norm = Math.hypot(...sliced);

  if (norm === 0) {
    return new Array(targetDim).fill(0);
  }

  return sliced.map((val) => val / norm);
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export class ArgonEmbedder {
  private localPipelinePromise: Promise<any> | null = null;
  private geminiClient: GoogleGenAI | null = null;
  public readonly provider: EmbeddingProvider;
  public readonly modelName: string;
  public readonly targetDim: number;
  private readonly geminiApiKey?: string;

  constructor(config?: EmbedderConfig) {
    // Explicit constructor config wins over the environment default.
    this.provider =
      config?.provider ??
      (process.env.EMBEDDING_PROVIDER as EmbeddingProvider | undefined) ??
      'auto';
    this.modelName =
      config?.modelName ??
      process.env.EMBEDDING_MODEL_NAME ??
      'onnx-community/embeddinggemma-2-ONNX';
    this.targetDim = config?.targetDim ?? 512;
    this.geminiApiKey = config?.geminiApiKey ?? process.env.GEMINI_API_KEY;

    if (config?.cacheDir) {
      env.cacheDir = config.cacheDir;
    }

    if (this.geminiApiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey: this.geminiApiKey });
    }
  }

  private async getLocalPipeline(): Promise<any> {
    if (!this.localPipelinePromise) {
      this.localPipelinePromise = pipeline(
        'feature-extraction',
        this.modelName,
        { dtype: 'q8', device: 'cpu' }
      );
      // Don't cache a failure (e.g. interrupted download): let the next call retry.
      this.localPipelinePromise.catch(() => {
        this.localPipelinePromise = null;
      });
    }
    return this.localPipelinePromise;
  }

  async embed(text: string, isQuery = false, title?: string): Promise<EmbedResult> {
    const formatted = formatInput(text, isQuery, title);

    if (this.provider === 'gemini') {
      const vector = await this.embedWithGemini(formatted);
      return {
        vector,
        dim: vector.length,
        provider: 'gemini',
        model: 'text-embedding-004',
      };
    }

    if (this.provider === 'local') {
      const vector = await this.embedWithLocal(formatted);
      return {
        vector,
        dim: vector.length,
        provider: 'local',
        model: this.modelName,
      };
    }

    // Auto mode: attempt local first, fallback to Gemini API
    try {
      const vector = await this.embedWithLocal(formatted);
      return {
        vector,
        dim: vector.length,
        provider: 'local',
        model: this.modelName,
      };
    } catch (err) {
      console.warn('Local ONNX embedding failed, falling back to Gemini API:', err);
      if (!this.geminiClient) {
        throw new Error(
          'Local embedder failed and GEMINI_API_KEY is not configured for fallback. Cause: ' +
            (err instanceof Error ? err.message : String(err))
        );
      }
      const vector = await this.embedWithGemini(formatted);
      return {
        vector,
        dim: vector.length,
        provider: 'gemini',
        model: 'text-embedding-004',
      };
    }
  }

  private async embedWithLocal(text: string): Promise<number[]> {
    const pipe = await this.getLocalPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: false });
    const rawFloats = output.data as Float32Array;
    return processMatryoshkaVector(rawFloats, this.targetDim);
  }

  private async embedWithGemini(text: string): Promise<number[]> {
    if (!this.geminiClient) {
      throw new Error('Gemini API client not initialized. GEMINI_API_KEY required.');
    }
    const response = await this.geminiClient.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
      config: { outputDimensionality: this.targetDim },
    });

    const values =
      response.embeddings?.[0]?.values ??
      (response as unknown as { embedding?: { values?: number[] } }).embedding?.values;
    if (!values) {
      throw new Error('Gemini embedContent returned empty embedding values.');
    }
    return processMatryoshkaVector(values, this.targetDim);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }
}
