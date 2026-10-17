import {
  GitHubRateLimitError,
  type GhCommitLogin,
  type GhIssue,
  type GhPull,
  type GhReview,
  type GitHubApi,
  type OctokitLike,
} from './types.js';

const PER_PAGE = 100;

/** Maps GitHub's primary / secondary rate-limit responses to GitHubRateLimitError. */
export function asRateLimitError(err: any): GitHubRateLimitError | null {
  const status = err?.status ?? err?.response?.status;
  const headers = err?.response?.headers ?? {};
  const remaining = headers['x-ratelimit-remaining'];
  const message = String(err?.message ?? '');
  const limited =
    status === 429 ||
    (status === 403 && (remaining === '0' || remaining === 0 || /rate limit|abuse|secondary/i.test(message)));
  if (!limited) return null;
  const reset = Number(headers['x-ratelimit-reset']);
  return new GitHubRateLimitError(message || 'GitHub API rate limit reached', Number.isFinite(reset) ? reset : undefined);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw asRateLimitError(err) ?? err;
  }
}

const user = (u: any) => (u && typeof u.login === 'string' ? { login: u.login, id: typeof u.id === 'number' ? u.id : undefined } : null);

/**
 * GitHubApi backed by an Octokit instance (or any object with the same `rest` surface).
 * Read-only: only list/get endpoints are used.
 */
export function createOctokitGitHubApi(octokit: OctokitLike): GitHubApi {
  return {
    async listMergedPulls({ owner, repo, max, since }) {
      const out: GhPull[] = [];
      const sinceMs = since ? Date.parse(since) : undefined;
      for (let page = 1; out.length < max; page++) {
        const res = await call(() =>
          octokit.rest.pulls.list({ owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: PER_PAGE, page })
        );
        const batch = res.data ?? [];
        let reachedOld = false;
        for (const p of batch) {
          if (sinceMs !== undefined && Date.parse(p.updated_at) < sinceMs) {
            reachedOld = true;
            break; // sorted by updated desc: everything after this is older
          }
          if (!p.merged_at) continue; // closed without merging: no code landed
          out.push({
            number: p.number,
            title: String(p.title ?? ''),
            body: p.body ?? null,
            state: p.state,
            merged_at: p.merged_at,
            updated_at: p.updated_at,
            html_url: p.html_url,
            user: user(p.user),
            merge_commit_sha: p.merge_commit_sha ?? null,
          });
          if (out.length >= max) break;
        }
        if (reachedOld || batch.length < PER_PAGE) break;
      }
      return out;
    },

    async listReviews({ owner, repo, number }) {
      const out: GhReview[] = [];
      for (let page = 1; page <= 3; page++) {
        const res = await call(() =>
          octokit.rest.pulls.listReviews({ owner, repo, pull_number: number, per_page: PER_PAGE, page })
        );
        const batch = res.data ?? [];
        for (const r of batch) {
          out.push({
            id: r.id,
            user: user(r.user),
            state: String(r.state ?? ''),
            body: r.body ?? null,
            submitted_at: r.submitted_at ?? null,
            html_url: r.html_url,
          });
        }
        if (batch.length < PER_PAGE) break;
      }
      return out;
    },

    async listPullFiles({ owner, repo, number }) {
      const list = octokit.rest.pulls.listFiles;
      if (!list) return [];
      const out: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const res = await call(() => list({ owner, repo, pull_number: number, per_page: PER_PAGE, page }));
        const batch = res.data ?? [];
        for (const f of batch) if (typeof f.filename === 'string') out.push(f.filename);
        if (batch.length < PER_PAGE) break;
      }
      return out;
    },

    async listIssues({ owner, repo, max, since }) {
      const out: GhIssue[] = [];
      for (let page = 1; out.length < max; page++) {
        const res = await call(() =>
          octokit.rest.issues.listForRepo({
            owner, repo, state: 'all', sort: 'updated', direction: 'desc', per_page: PER_PAGE, page,
            ...(since ? { since } : {}),
          })
        );
        const batch = res.data ?? [];
        for (const i of batch) {
          if (i.pull_request) continue; // the issues endpoint also lists pull requests
          out.push({
            number: i.number,
            title: String(i.title ?? ''),
            body: i.body ?? null,
            state: i.state === 'closed' ? 'closed' : 'open',
            created_at: i.created_at,
            updated_at: i.updated_at,
            html_url: i.html_url,
            user: user(i.user),
          });
          if (out.length >= max) break;
        }
        if (batch.length < PER_PAGE) break;
      }
      return out;
    },

    async getIssue({ owner, repo, number }) {
      try {
        const res = await call(() => octokit.rest.issues.get({ owner, repo, issue_number: number }));
        const i = res.data;
        if (!i || i.pull_request) return null;
        return {
          number: i.number,
          title: String(i.title ?? ''),
          body: i.body ?? null,
          state: i.state === 'closed' ? 'closed' : 'open',
          created_at: i.created_at,
          updated_at: i.updated_at,
          html_url: i.html_url,
          user: user(i.user),
        };
      } catch (err) {
        if (err instanceof GitHubRateLimitError) throw err;
        if ((err as any)?.status === 404 || (err as any)?.status === 410) return null;
        throw err;
      }
    },

    async listCommitLogins({ owner, repo, max }) {
      const out: GhCommitLogin[] = [];
      for (let page = 1; out.length < max; page++) {
        const res = await call(() => octokit.rest.repos.listCommits({ owner, repo, per_page: PER_PAGE, page }));
        const batch = res.data ?? [];
        for (const c of batch) {
          out.push({ sha: c.sha, login: c.author?.login ?? null, id: typeof c.author?.id === 'number' ? c.author.id : undefined });
          if (out.length >= max) break;
        }
        if (batch.length < PER_PAGE) break;
      }
      return out;
    },
  };
}

/**
 * Builds the default API for a token (dynamic import keeps `@octokit/rest` out of the module
 * graph for callers that always inject their own `GitHubApi`). Without a token, only public
 * data is readable and GitHub allows ~60 calls per hour.
 */
export async function createDefaultGitHubApi(token?: string): Promise<GitHubApi> {
  const { Octokit } = await import('@octokit/rest');
  return createOctokitGitHubApi(new Octokit(token ? { auth: token } : {}) as unknown as OctokitLike);
}
