import { z } from 'zod';
import { redactSecrets } from '../git/redact.js';
import type { MinedDecision } from '../mining/types.js';

/**
 * Chat threads as a second "company brain" source (docs, tickets AND chats).
 *
 * There is no live Slack/Teams integration. The only supported input is a JSON file of decision
 * threads that is **explicitly marked `"synthetic": true`**: the reader refuses anything else, so
 * invented conversations can never be mistaken for ingested real ones. Each thread that ended in
 * a decision becomes a `(:Decision {source_kind: 'chat', synthetic: true})` node with the same
 * edges every other decision has: GOVERNS (component), SUPERSEDES (an earlier decision), and
 * EXTRACTED_FROM (the pull request the thread was about).
 */

const epochSeconds = z.number().int().positive();

export const ChatMessageSchema = z.object({
  author: z.string().min(1),
  at: epochSeconds,
  text: z.string().min(1).max(4000),
});

export const ChatDecisionSchema = z.object({
  /** Stable decision id (e.g. "CHAT-001"); it is what briefings cite. */
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, 'invalid decision id'),
  title: z.string().min(5).max(200),
  /** What was decided, in one or two sentences. This is what gets embedded. */
  summary: z.string().min(10).max(600),
  component: z.string().min(1),
  status: z.enum(['accepted', 'proposed']).default('accepted'),
  /** Epoch seconds the decision took effect. Defaults to the thread's last message. */
  valid_from: epochSeconds.optional(),
  /** Id of the earlier decision this one replaces; that decision's validity window is closed. */
  supersedes: z.string().min(1).optional(),
  /** PullRequest node id the thread discussed -> `(Decision)-[:EXTRACTED_FROM]->(PullRequest)`. */
  extracted_from: z.string().min(1).optional(),
  /** Optional precomputed 512-d embedding (fixtures ship one so seeding needs no model download). */
  embedding: z.array(z.number()).length(512).optional(),
});

export const ChatThreadSchema = z.object({
  id: z.string().min(1),
  channel: z.string().min(1).max(80),
  /** Absolute http(s) permalink of the thread (fictional for synthetic data). */
  url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'url must be http(s)'),
  messages: z.array(ChatMessageSchema).min(1).max(100),
  decision: ChatDecisionSchema,
});

export const ChatThreadFileSchema = z.object({
  /** Must be literally `true`: there is no real chat integration, so every file is invented data. */
  synthetic: z.literal(true, {
    errorMap: () => ({ message: 'chat thread files must declare "synthetic": true (no real chat source exists)' }),
  }),
  note: z.string().optional(),
  threads: z.array(ChatThreadSchema).min(1).max(200),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type ChatThreadFile = z.infer<typeof ChatThreadFileSchema>;

/** Decision row for the writer: a MinedDecision plus the chat-specific labels. */
export interface ChatDecision extends MinedDecision {
  source_kind: 'chat';
  synthetic: true;
  source_channel: string;
}

export interface ChatMapping {
  decisions: ChatDecision[];
  governs: Array<{ decision_id: string; component_name: string }>;
  supersedes: Array<{ source_id: string; target_id: string }>;
  extractedFrom: Array<{ decision_id: string; pr_id: string }>;
}

/** Parses and validates a decision-thread document. Throws a readable error when it is invalid. */
export function parseChatThreads(input: unknown): ChatThreadFile {
  const parsed = ChatThreadFileSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ');
    throw new Error(`Invalid chat thread file: ${detail}`);
  }
  const ids = new Set<string>();
  for (const t of parsed.data.threads) {
    if (ids.has(t.decision.id)) throw new Error(`Invalid chat thread file: duplicate decision id ${t.decision.id}`);
    ids.add(t.decision.id);
  }
  for (const t of parsed.data.threads) {
    const target = t.decision.supersedes;
    if (target && !ids.has(target)) {
      throw new Error(`Invalid chat thread file: ${t.decision.id} supersedes unknown decision ${target}`);
    }
    if (target === t.decision.id) throw new Error(`Invalid chat thread file: ${t.decision.id} supersedes itself`);
  }
  return parsed.data;
}

/**
 * Maps validated threads to graph rows. Pure and deterministic (same input => same ids and
 * timestamps), so writing it twice is idempotent. A superseded decision's `valid_to` is closed at
 * the moment its replacement takes effect, exactly like ADR supersession.
 */
export function chatThreadsToDecisions(file: ChatThreadFile): ChatMapping {
  const byId = new Map<string, ChatDecision>();
  const out: ChatDecision[] = [];

  for (const thread of file.threads) {
    const d = thread.decision;
    const lastMessageAt = Math.max(...thread.messages.map((m) => m.at));
    const transcript = thread.messages
      .map((m) => `${redactSecrets(m.author)}: ${redactSecrets(m.text)}`)
      .join('\n')
      .slice(0, 4000);
    const row: ChatDecision = {
      id: d.id,
      title: redactSecrets(d.title),
      status: d.status,
      valid_from: d.valid_from ?? lastMessageAt,
      valid_to: null,
      source_url: thread.url,
      source_kind: 'chat',
      summary: redactSecrets(d.summary),
      raw_text: transcript,
      synthetic: true,
      source_channel: thread.channel,
      component_name: d.component,
      origin_pr: d.extracted_from,
      supersedes_id: d.supersedes,
      ...(d.embedding ? { embedding: d.embedding } : {}),
    };
    byId.set(row.id, row);
    out.push(row);
  }

  const supersedes: ChatMapping['supersedes'] = [];
  for (const row of out) {
    if (!row.supersedes_id) continue;
    const target = byId.get(row.supersedes_id)!;
    // The replacement must come later; otherwise the window would close before it opened.
    if (target.valid_from >= row.valid_from) {
      throw new Error(
        `Invalid chat thread file: ${row.id} supersedes ${target.id} but does not take effect after it`
      );
    }
    target.valid_to = row.valid_from;
    target.status = 'superseded';
    supersedes.push({ source_id: row.id, target_id: target.id });
  }

  return {
    decisions: out,
    governs: out.map((d) => ({ decision_id: d.id, component_name: d.component_name! })),
    supersedes,
    extractedFrom: out.filter((d) => d.origin_pr).map((d) => ({ decision_id: d.id, pr_id: d.origin_pr! })),
  };
}
