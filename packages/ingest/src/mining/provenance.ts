import { simpleGit } from 'simple-git';
import type { GitCommit } from '../git/types.js';
import type { MinedDecision } from './types.js';
import { blobUrl, commitUrl, type GitHubRepo } from '../github/repo.js';

export interface ExtractedFromEdge {
  decision_id: string;
  pr_id: string;
}

/** `pr_<sha12>`: the PullRequest node the pipeline writes for a git commit. */
export const commitNodeId = (hash: string): string => `pr_${hash.slice(0, 12)}`;

/**
 * For every file ever added in the mined history, the commit that first added it
 * (oldest commit wins when a path was added more than once). One `git log` call.
 */
export async function findFirstAddCommits(repoPath: string, maxCommits = 1000): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const raw = await simpleGit(repoPath).raw([
      'log',
      `--max-count=${maxCommits}`,
      '--diff-filter=A',
      '--name-only',
      '--pretty=format:COMMIT_HASH:%H',
    ]);
    let current = '';
    // `git log` lists newest first, so later lines overwrite earlier ones => oldest add wins
    for (const line of raw.split('\n')) {
      if (line.startsWith('COMMIT_HASH:')) current = line.slice('COMMIT_HASH:'.length).trim();
      else if (line.trim() && current) out.set(line.trim(), current);
    }
  } catch {
    // provenance is best-effort: no add-commit info just means fewer EXTRACTED_FROM edges
  }
  return out;
}

export interface ProvenanceInput {
  decisions: MinedDecision[];
  commits: GitCommit[];
  /** Set when the repository is on github.com: enables clickable source URLs. */
  repo: GitHubRepo | null;
  /** path -> hash of the commit that first added it (see findFirstAddCommits). */
  addCommits?: Map<string, string>;
}

/**
 * Decision provenance, offline (no GitHub API needed):
 *  - `(Decision)-[:EXTRACTED_FROM]->(PullRequest)`: a commit-mined decision points at the commit
 *    that introduced it, an ADR at the commit that first added the file, a comment-mined decision
 *    at its pull request. Only commits inside the mined window have nodes, so others are skipped.
 *  - `source_url`: for github.com repositories, a real link (commit permalink, or a permalink to
 *    the ADR at the mined revision). Other repositories keep the existing non-link values.
 *
 * Mutates `decisions[].source_url` and returns the edges. Call it AFTER supersession resolution:
 * that step matches on the original `source_url`.
 */
export function applyDecisionProvenance(input: ProvenanceInput): ExtractedFromEdge[] {
  const known = new Set(input.commits.map((c) => commitNodeId(c.hash)));
  const headHash = input.commits[0]?.hash;
  const edges: ExtractedFromEdge[] = [];
  const seen = new Set<string>();

  const link = (decisionId: string, prId: string | undefined) => {
    if (!prId || !known.has(prId) && !prId.startsWith('pr_gh_')) return;
    const key = `${decisionId}|${prId}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ decision_id: decisionId, pr_id: prId });
  };

  for (const d of input.decisions) {
    if (d.origin_commit) {
      link(d.id, commitNodeId(d.origin_commit));
      if (input.repo) d.source_url = commitUrl(input.repo, d.origin_commit);
    } else if (d.origin_path) {
      const added = input.addCommits?.get(d.origin_path);
      if (added) link(d.id, commitNodeId(added));
      if (input.repo && headHash) d.source_url = blobUrl(input.repo, headHash, d.origin_path);
    } else if (d.origin_pr) {
      // comment-mined decision: a link to the exact review comment is already in source_url
      link(d.id, d.origin_pr);
    }
  }
  return edges;
}
