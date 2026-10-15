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
