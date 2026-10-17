import type { RepoRef } from './types.js';

const CLOSING = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)';
// "Fixes #12", "closes: #1, #2 and #3", "Resolves acme/app#9", "fixes https://github.com/acme/app/issues/4"
const CLOSING_RE = new RegExp(
  `\\b${CLOSING}\\b:?\\s+((?:(?:[\\w.-]+\\/[\\w.-]+)?#\\d+|https?:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/issues\\/\\d+)(?:\\s*(?:,|and|&)\\s*(?:(?:[\\w.-]+\\/[\\w.-]+)?#\\d+|https?:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/issues\\/\\d+))*)`,
  'gi'
);
const REF_RE = /(?:([\w.-]+\/[\w.-]+))?#(\d+)|https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/gi;

/**
 * Issue numbers a pull request closes, from GitHub's closing keywords in its title / body.
 * Only same-repository references count (cross-repo ones cannot be linked inside this graph).
 * Fenced and inline code is ignored so quoted examples ("use `Fixes #1`") do not create edges.
 */
export function parseClosingReferences(text: string | null | undefined, repo: RepoRef): number[] {
  if (!text) return [];
  const withoutCode = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  const self = `${repo.owner}/${repo.repo}`.toLowerCase();
  const out = new Set<number>();

  for (const match of withoutCode.matchAll(CLOSING_RE)) {
    const group = match[1]!;
    for (const ref of group.matchAll(REF_RE)) {
      const slug = (ref[1] ?? ref[3])?.toLowerCase();
      const num = Number(ref[2] ?? ref[4]);
      if (!Number.isInteger(num) || num <= 0) continue;
      if (slug && slug !== self) continue;
      out.add(num);
    }
  }
  return [...out].sort((a, b) => a - b);
}
