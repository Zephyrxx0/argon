import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ArgonEmbedder,
  formatInput,
  processMatryoshkaVector,
  cosineSimilarity,
} from '../src/embedding/embedder';

describe('ArgonEmbedder Mathematical Invariants', () => {
  let embedder: ArgonEmbedder;

  beforeEach(() => {
    // Explicitly use local ONNX CPU execution
    embedder = new ArgonEmbedder({ provider: 'local' });
  });

  it('formats query and document inputs with required task-specific prefixes', () => {
    const queryInput = formatInput('how to rollback migration', true);
    expect(queryInput).toBe('task: search result | query: how to rollback migration');

    const docInput = formatInput('Authentication using JWT', false, 'ADR-001');
    expect(docInput).toBe('title: ADR-001 | text: Authentication using JWT');

    const defaultDocInput = formatInput('General architecture overview', false);
    expect(defaultDocInput).toBe('title: Document | text: General architecture overview');
  });

  it('slices and re-normalizes synthetic vectors to exact 512 dimensions with unit L2 norm', () => {
    // Generate synthetic 768-d vector
    const raw768 = Array.from({ length: 768 }, (_, i) => Math.sin(i + 1) * 2.5);
    const processed = processMatryoshkaVector(raw768, 512);

    expect(processed).toHaveLength(512);

    const norm = Math.hypot(...processed);
    expect(Math.abs(norm - 1.0)).toBeLessThan(1e-4);
  });

  it('safely handles zero-vectors without NaN or Infinity division artifacts', () => {
    const zeroVector = new Array(768).fill(0);
    const processed = processMatryoshkaVector(zeroVector, 512);

    expect(processed).toHaveLength(512);
    expect(processed.every((v) => v === 0)).toBe(true);
    expect(processed.some((v) => Number.isNaN(v) || !Number.isFinite(v))).toBe(false);
  });

  it('computes correct cosine similarity for canonical test vectors', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];

    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5);

    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector dimension mismatch');
  });

  it('embeds document to strictly 512 dimensions and unit L2 norm', async () => {
    const result = await embedder.embed(
      'Architecture decision record for authentication',
      false,
      'ADR-001'
    );

    // Invariant 1: Dimensionality
    expect(result.vector).toHaveLength(512);
    expect(result.dim).toBe(512);
    expect(result.provider).toBe('local');

    // Invariant 2: Strict Unit L2 Norm (|norm - 1.0| < 1e-4)
    const norm = Math.hypot(...result.vector);
    expect(Math.abs(norm - 1.0)).toBeLessThan(1e-4);
  });

  it('embeds query to strictly 512 dimensions and unit L2 norm', async () => {
    const result = await embedder.embed('search for auth architecture', true);

    expect(result.vector).toHaveLength(512);
    expect(result.dim).toBe(512);

    const norm = Math.hypot(...result.vector);
    expect(Math.abs(norm - 1.0)).toBeLessThan(1e-4);
  });
});

describe('Semantic Clustering Sanity', () => {
  it('ranks semantically related engineering queries strictly higher than unrelated queries', async () => {
    const embedder = new ArgonEmbedder({ provider: 'local' });

    // Semantically related queries (Git history management & rollback)
    const q1 = await embedder.embed('git rollback and revert commit history', true);
    const q2 = await embedder.embed('undo merged pull request and restore branch', true);

    // Unrelated query (UI CSS styling)
    const q3 = await embedder.embed('css brutalist cyberpunk color palette and typography', true);

    const simRelated = cosineSimilarity(q1.vector, q2.vector);
    const simUnrelated = cosineSimilarity(q1.vector, q3.vector);

    // Assert related similarity is meaningfully higher than unrelated (> 0.15 margin)
    expect(simRelated).toBeGreaterThan(simUnrelated);
    expect(simRelated - simUnrelated).toBeGreaterThan(0.15);
  });
});

describe('Provider Configuration & Fallback Mechanics', () => {
  const originalEnv = process.env.EMBEDDING_PROVIDER;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EMBEDDING_PROVIDER = originalEnv;
    } else {
      delete process.env.EMBEDDING_PROVIDER;
    }
  });

  it('respects constructor provider configuration', () => {
    delete process.env.EMBEDDING_PROVIDER;

    const localEmbedder = new ArgonEmbedder({ provider: 'local' });
    expect(localEmbedder.provider).toBe('local');

    const geminiEmbedder = new ArgonEmbedder({ provider: 'gemini' });
    expect(geminiEmbedder.provider).toBe('gemini');

    const autoEmbedder = new ArgonEmbedder({ provider: 'auto' });
    expect(autoEmbedder.provider).toBe('auto');
  });

  it('respects EMBEDDING_PROVIDER environment variable override', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    const embedder1 = new ArgonEmbedder();
    expect(embedder1.provider).toBe('local');

    process.env.EMBEDDING_PROVIDER = 'gemini';
    const embedder2 = new ArgonEmbedder();
    expect(embedder2.provider).toBe('gemini');
  });

  it('throws descriptive error if gemini provider called without api key', async () => {
    delete process.env.GEMINI_API_KEY;
    const embedder = new ArgonEmbedder({ provider: 'gemini', geminiApiKey: undefined });

    await expect(embedder.embed('test query', true)).rejects.toThrow(
      'Gemini API client not initialized. GEMINI_API_KEY required.'
    );
  });
});

describe('Shared model cache resolution', () => {
  it('prefers TRANSFORMERS_CACHE, then the monorepo root, then the cwd', async () => {
    const { resolveModelCacheDir } = await import('../src/embedding/embedder.js');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const os = await import('node:os');

    expect(resolveModelCacheDir('/anywhere', { TRANSFORMERS_CACHE: '/custom/cache' } as any)).toBe('/custom/cache');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argon-cache-'));
    try {
      fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
      const nested = path.join(root, 'apps', 'gateway');
      fs.mkdirSync(nested, { recursive: true });
      // any process started inside the monorepo shares ONE cache at the root
      expect(resolveModelCacheDir(nested, {} as any)).toBe(path.join(root, '.cache', 'models'));
      expect(resolveModelCacheDir(root, {} as any)).toBe(path.join(root, '.cache', 'models'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'argon-lone-'));
    try {
      // no workspace file above (tmpdir is outside any monorepo): falls back to cwd
      expect(resolveModelCacheDir(lone, {} as any)).toBe(path.join(lone, '.cache', 'models'));
    } finally {
      fs.rmSync(lone, { recursive: true, force: true });
    }
  });
});
