import { createHash } from 'node:crypto';
import { redactSecrets } from '../git/redact.js';
import type { MinedDecision } from '../mining/types.js';

// Deliberately strict: a decision is only recorded when somebody says so explicitly. Casual review
// talk ("maybe we should...", "I'd go with...") must not become an architectural decision.
const DECISION_LANGUAGE =
  /\b(?:we(?:'ve| have)? decided|decision:|decided (?:to|that|on)|agreed (?:to|that|on)|going forward,? we|from now on,? we|we(?:'ll| will) (?:no longer|stop|always|never)|let'?s (?:standardi[sz]e|stick with))\b/i;

export interface CommentSource {
  /** PullRequest node id the comment belongs to. */
  prId: string;
  prNumber: number;
  /** Component the PR's files belong to; a decision needs one to govern. */
  component: string | undefined;
  /** Comment author, only used to skip bots. */
  login: string | null | undefined;
  text: string | null | undefined;
  /** Permalink to the comment / review / PR. */
  url: string;
  /** Epoch seconds the comment was written. */
  at: number;
}

/** The sentence that states the decision, trimmed. */
function decisionSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = DECISION_LANGUAGE.exec(flat);
  const from = m ? Math.max(0, flat.lastIndexOf('.', m.index) + 1) : 0;
  const rest = flat.slice(from).trim();
  const end = rest.search(/(?<=[.!?])\s/);
  return (end > 0 ? rest.slice(0, end) : rest).slice(0, 280).trim();
}

/**
 * Mines `Decision {source_kind: 'comment'}` records from PR review bodies / descriptions.
 * Conservative on purpose: explicit decision language, human authors, and a component to govern.
 */
export function mineCommentDecisions(comments: CommentSource[]): MinedDecision[] {
  const out: MinedDecision[] = [];
  const seen = new Set<string>();
  for (const c of comments) {
    const text = redactSecrets(c.text ?? '').trim();
    if (text.length < 30 || !c.component) continue;
    if (!c.login || /\[bot\]$/i.test(c.login)) continue;
    if (!DECISION_LANGUAGE.test(text)) continue;

    const sentence = decisionSentence(text);
    if (sentence.length < 20) continue;
    const id = `dec_comment_${c.prNumber}_${createHash('sha256').update(`${c.prId}|${c.url}|${sentence}`).digest('hex').slice(0, 8)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      title: sentence.length > 100 ? `${sentence.slice(0, 97)}...` : sentence,
      status: 'accepted',
      valid_from: c.at,
      valid_to: null,
      source_url: c.url,
      source_kind: 'comment',
      summary: text.replace(/\s+/g, ' ').slice(0, 300),
      raw_text: text.slice(0, 2000),
      component_name: c.component,
      origin_pr: c.prId,
    });
  }
  return out;
}
