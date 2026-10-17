import { ArgonEmbedder } from '@argon/graph';
import type { MinedDecision } from './types.js';

/**
 * Batches and embeds mined decisions using ArgonEmbedder from packages/graph.
 * Enforces 512-d Matryoshka truncation and L2 re-normalization.
 */
export async function embedDecisions(
  decisions: MinedDecision[],
  embedder?: ArgonEmbedder,
  batchSize = 8
): Promise<MinedDecision[]> {
  if (decisions.length === 0) {
    return decisions;
  }

  const activeEmbedder = embedder || new ArgonEmbedder();

  for (let i = 0; i < decisions.length; i += batchSize) {
    const chunk = decisions.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map((d) => activeEmbedder.embed(d.summary || d.title, false, d.title))
    );

    for (let j = 0; j < chunk.length; j++) {
      chunk[j].embedding = results[j].vector;
    }
  }

  return decisions;
}

/**
 * Embeds decisions but never lets an embedding problem (model download interrupted, no
 * network, provider quota...) abort the whole ingestion: the graph is still fully usable for
 * ownership, blast radius and file/component briefings; only vector precedent search for
 * these decisions is unavailable. Returns whether vectors were produced.
 */
export async function embedDecisionsBestEffort(
  decisions: MinedDecision[],
  embed: (d: MinedDecision[]) => Promise<MinedDecision[]> = embedDecisions
): Promise<{ embedded: boolean; error?: string }> {
  try {
    await embed(decisions);
    return { embedded: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ingest] Decision embedding failed; continuing without vectors: ${message}`);
    return { embedded: false, error: message };
  }
}
