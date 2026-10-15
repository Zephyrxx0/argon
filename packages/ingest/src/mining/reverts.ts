import type { GitCommit } from '../git/types.js';
import type { RevertLink } from './types.js';

/**
 * Mines git revert commits and builds relationships to the reverted commits.
 */
export function mineReverts(commits: GitCommit[]): RevertLink[] {
  const revertLinks: RevertLink[] = [];
  const commitByHash = new Map<string, GitCommit>();
  const commitBySummary = new Map<string, GitCommit>();

  for (const c of commits) {
    commitByHash.set(c.hash, c);
    commitBySummary.set(c.summary.toLowerCase().trim(), c);
  }

  for (const commit of commits) {
    const msg = commit.message;
    const summary = commit.summary;

    // Pattern 1: git revert default: Revert "feat: some feature"
    const revertMatch = summary.match(/^Revert\s+"([^"]+)"/i) || summary.match(/^Revert\s+(.+)$/i);
    // Pattern 2: This reverts commit <hash>
    const hashMatch = msg.match(/This reverts commit ([a-f0-9]{7,40})/i);

    let targetHash: string | undefined;
    let targetTitle: string | undefined;

    if (hashMatch) {
      const matchHash = hashMatch[1];
      for (const [hash, c] of commitByHash.entries()) {
        if (hash.startsWith(matchHash) || matchHash.startsWith(hash)) {
          targetHash = hash;
          targetTitle = c.summary;
          break;
        }
      }
    }

    if (!targetHash && revertMatch) {
      const targetSummary = revertMatch[1].toLowerCase().trim();
      if (commitBySummary.has(targetSummary)) {
        const targetCommit = commitBySummary.get(targetSummary)!;
        if (targetCommit.hash !== commit.hash) {
          targetHash = targetCommit.hash;
          targetTitle = targetCommit.summary;
        }
      }
    }

    if (targetHash) {
      revertLinks.push({
        revert_commit_hash: commit.hash,
        reverted_commit_hash: targetHash,
        revert_title: commit.summary,
        reverted_title: targetTitle,
      });
    }
  }

  return revertLinks;
}
