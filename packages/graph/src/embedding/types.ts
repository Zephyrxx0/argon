export type EmbeddingProvider = 'local' | 'gemini' | 'auto';

export interface EmbedderConfig {
  provider?: EmbeddingProvider;
  modelName?: string;
  cacheDir?: string;
  geminiApiKey?: string;
  targetDim?: number;
}

export interface EmbedResult {
  vector: number[];
  dim: number;
  provider: string;
  model: string;
}
