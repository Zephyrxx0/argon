/**
 * Narrow, test-friendly view of the GitHub REST API used by the "Company Brain" stage.
 * The pipeline depends on this interface (not on Octokit), so tests inject recorded fixtures
 * and nothing in CI touches the network.
 */

export interface GhUser {
  login: string;
  /** GitHub numeric user id (used to recognise `<id>+<login>@users.noreply.github.com` commits). */
  id?: number;
}

export interface GhPull {
  number: number;
  title: string;
  body: string | null;
  /** GitHub only reports open|closed; "merged" is `merged_at != null`. */
  state: 'open' | 'closed';
  merged_at: string | null;
  updated_at: string;
  html_url: string;
  user: GhUser | null;
  merge_commit_sha: string | null;
}

export interface GhReview {
  id: number;
  user: GhUser | null;
  /** APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING */
  state: string;
  body: string | null;
  submitted_at: string | null;
  html_url?: string;
}

export interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  html_url: string;
  user: GhUser | null;
}

export interface GhCommitLogin {
  sha: string;
  login: string | null;
  id?: number;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface GitHubApi {
  /** Merged pull requests, newest activity first. `since` (ISO) stops paging at older ones. */
  listMergedPulls(args: RepoRef & { max: number; since?: string }): Promise<GhPull[]>;
  listReviews(args: RepoRef & { number: number }): Promise<GhReview[]>;
  /** Real issues only (pull requests are filtered out), newest activity first. */
  listIssues(args: RepoRef & { max: number; since?: string }): Promise<GhIssue[]>;
  /** One issue, or null when it does not exist / is a pull request. */
  getIssue(args: RepoRef & { number: number }): Promise<GhIssue | null>;
  /** sha -> GitHub login for the most recent commits (maps reviewers to git authors). */
  listCommitLogins(args: RepoRef & { max: number }): Promise<GhCommitLogin[]>;
  /**
   * Paths changed by a pull request. Used for PRs whose merge commit is not in the mined history
   * (e.g. merged into a non-default branch), so their reviews still count towards the files /
   * components they touched. Optional: implementations without it skip that enrichment.
   */
  listPullFiles?(args: RepoRef & { number: number }): Promise<string[]>;
}

/** Thrown by an API implementation when GitHub refuses further calls (rate limit / abuse limit). */
export class GitHubRateLimitError extends Error {
  constructor(message = 'GitHub API rate limit reached', readonly resetAt?: number) {
    super(message);
    this.name = 'GitHubRateLimitError';
  }
}

/** The subset of Octokit the adapter calls (structural, so a fake can be injected in tests). */
export interface OctokitLike {
  rest: {
    pulls: {
      list(params: Record<string, unknown>): Promise<{ data: any[] }>;
      listReviews(params: Record<string, unknown>): Promise<{ data: any[] }>;
      listFiles?(params: Record<string, unknown>): Promise<{ data: any[] }>;
    };
    issues: {
      listForRepo(params: Record<string, unknown>): Promise<{ data: any[] }>;
      get(params: Record<string, unknown>): Promise<{ data: any }>;
    };
    repos: {
      listCommits(params: Record<string, unknown>): Promise<{ data: any[] }>;
    };
  };
}
