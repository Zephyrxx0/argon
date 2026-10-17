import type { RepoRef } from './types.js';

export interface GitHubRepo extends RepoRef {
  /** https://github.com/<owner>/<repo> */
  webUrl: string;
}

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * Parses a github.com repository URL (https, optional `.git`, optional credentials which are
 * ignored). Anything else (local paths, other hosts, GitHub Enterprise) returns null: no GitHub
 * links are fabricated for repositories we cannot name.
 */
export function parseGitHubRepo(repoUrl: string | undefined | null): GitHubRepo | null {
  if (!repoUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(repoUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, '');
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo, webUrl: `https://github.com/${owner}/${repo}` };
}

export const commitUrl = (r: GitHubRepo, sha: string): string => `${r.webUrl}/commit/${sha}`;
export const pullUrl = (r: GitHubRepo, n: number): string => `${r.webUrl}/pull/${n}`;
export const issueUrl = (r: GitHubRepo, n: number): string => `${r.webUrl}/issues/${n}`;
/** Permalink to a file at a specific revision. Path segments are encoded, slashes kept. */
export const blobUrl = (r: GitHubRepo, ref: string, filePath: string): string =>
  `${r.webUrl}/blob/${ref}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
