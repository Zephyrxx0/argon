import type { GitCommit } from '../git/types.js';
import type { MinedDecision } from './types.js';

const ARCHITECTURAL_COMMIT_REGEX =
  /(?:revert|supersede|deprecate|architect|rfc|adr|decision|breaking\s+change)/i;

/**
 * Mines architectural decisions from commit messages using regex heuristic pre-filtering.
 */
export function mineCommitDecisions(commits: GitCommit[]): MinedDecision[] {
  const decisions: MinedDecision[] = [];

  for (const commit of commits) {
    const fullText = commit.message.trim();
    if (!ARCHITECTURAL_COMMIT_REGEX.test(fullText)) {
      continue;
    }

    const title = commit.summary;
    const bodyLines = commit.message.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
    const summary = bodyLines.length > 0 ? bodyLines.slice(0, 3).join(' ') : title;

    let status: MinedDecision['status'] = 'accepted';
    if (fullText.toLowerCase().includes('revert')) {
      status = 'superseded';
    } else if (fullText.toLowerCase().includes('deprecat')) {
      status = 'superseded';
    }

    decisions.push({
      id: `dec_commit_${commit.hash.slice(0, 12)}`,
      title,
      status,
      valid_from: commit.timestamp,
      valid_to: null,
      source_url: `commit://${commit.hash}`,
      source_kind: 'commit',
      summary: summary.slice(0, 300),
      raw_text: fullText.slice(0, 2000),
      origin_commit: commit.hash,
    });
  }

  return decisions;
}
