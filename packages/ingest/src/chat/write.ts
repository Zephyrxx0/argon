import type { ArgonGraphClient } from '@argon/graph';
import { FalkorIngestWriter } from '../writer/falkordb.js';
import { embedDecisionsBestEffort } from '../mining/embed.js';
import { chatThreadsToDecisions, parseChatThreads, type ChatMapping, type ChatThreadFile } from './threads.js';

export interface WriteChatThreadsResult {
  decisions: number;
  governs: number;
  supersedes: number;
  extractedFrom: number;
  /** Edges skipped because the component or pull request does not exist in this workspace. */
  skipped: { components: string[]; pullRequests: string[] };
  /** False when some decisions have no vector (precedent search cannot find them). */
  embedded: boolean;
}

/**
 * Writes chat decisions into a workspace graph. Everything is a MERGE, so running it twice adds
 * nothing. Edges are only created towards components / pull requests that already exist (a thread
 * about something unknown stays a decision without that edge, it never invents graph nodes).
 */
export async function writeChatThreads(
  client: ArgonGraphClient,
  workspaceId: string,
  input: ChatThreadFile | unknown,
  options: { embed?: boolean } = {}
): Promise<WriteChatThreadsResult> {
  const file = parseChatThreads(input);
  const mapping: ChatMapping = chatThreadsToDecisions(file);

  // Only decisions without a shipped vector need the (local, CPU) embedding model.
  const missing = mapping.decisions.filter((d) => !d.embedding);
  let embedded = true;
  if (missing.length > 0 && options.embed !== false) {
    embedded = (await embedDecisionsBestEffort(missing)).embedded;
  } else if (missing.length > 0) {
    embedded = false;
  }

  const existing = async (query: string, key: string): Promise<Set<string>> => {
    const res = await client.roQuery(workspaceId, query);
    return new Set((res.data ?? []).map((r: any) => String(r[key])));
  };
  const components = await existing('MATCH (c:Component) RETURN c.name AS name', 'name');
  const prs = await existing('MATCH (p:PullRequest) RETURN p.id AS id', 'id');

  const governs = mapping.governs.filter((e) => components.has(e.component_name));
  const extractedFrom = mapping.extractedFrom.filter((e) => prs.has(e.pr_id));
  const skipped = {
    components: [...new Set(mapping.governs.filter((e) => !components.has(e.component_name)).map((e) => e.component_name))],
    pullRequests: [...new Set(mapping.extractedFrom.filter((e) => !prs.has(e.pr_id)).map((e) => e.pr_id))],
  };

  const writer = new FalkorIngestWriter(client, workspaceId);
  await writer.writeDecisions(
    mapping.decisions.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      valid_from: d.valid_from,
      valid_to: d.valid_to,
      source_url: d.source_url,
      source_kind: d.source_kind,
      summary: d.summary,
      embedding: d.embedding,
      synthetic: d.synthetic,
      source_channel: d.source_channel,
    }))
  );
  await writer.writeGovernsEdges(governs);
  await writer.writeSupersedesEdges(mapping.supersedes);
  await writer.writeExtractedFromEdges(extractedFrom);

  return {
    decisions: mapping.decisions.length,
    governs: governs.length,
    supersedes: mapping.supersedes.length,
    extractedFrom: extractedFrom.length,
    skipped,
    embedded,
  };
}
