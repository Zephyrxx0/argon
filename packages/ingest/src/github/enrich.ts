import { redactSecrets } from '../git/redact.js';
import type { GitCommit } from '../git/types.js';
import type { MinedDecision } from '../mining/types.js';
import { resolveComponentForFile } from '../coupling/components.js';
import { mineCommentDecisions, type CommentSource } from './comments.js';
import { IdentityResolver, isBotLogin } from './identity.js';
import { parseClosingReferences } from './references.js';
import { issueUrl, pullUrl, type GitHubRepo } from './repo.js';
import {
  GitHubRateLimitError,
  type GhIssue,
  type GhPull,
  type GhReview,
  type GitHubApi,
} from './types.js';

export interface GitHubLimits {
  /** Most recent merged pull requests to read. */
  maxPullRequests: number;
  maxIssues: number;
  /** Commits whose GitHub login is read to map reviewers to git authors (0 = skip). */
  maxCommitLogins: number;
  /** Closed-by references to issues outside the fetched window that are looked up one by one. */
  maxIssueLookups: number;
  /** Parallel review requests. */
  concurrency: number;
  /** PRs outside the mined history whose changed files are read (0 = skip). */
  maxPullFileLookups: number;
}

/** Authenticated: 5000 calls/h. Anonymous: 60 calls/h, so stay well below it. */
export const AUTHENTICATED_LIMITS: GitHubLimits = {
  maxPullRequests: 200,
  maxIssues: 200,
  maxCommitLogins: 500,
  maxIssueLookups: 30,
  concurrency: 5,
  maxPullFileLookups: 100,
};
export const ANONYMOUS_LIMITS: GitHubLimits = {
  maxPullRequests: 25,
  maxIssues: 25,
  maxCommitLogins: 0,
  maxIssueLookups: 0,
  concurrency: 3,
  maxPullFileLookups: 0,
};

export interface PullRequestRow {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'merged';
  body_excerpt: string;
  /** Epoch seconds. */
  merged_at: number;
  is_revert: boolean;
}

export interface IssueRow {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string;
  /** Epoch seconds. */
  created_at: number;
}

export interface ReviewRow {
  reviewer_id: string;
  pr_id: string;
  /** Latest review state by this reviewer on this PR. */
  state: string;
  /** Number of submitted reviews by this reviewer on this PR. */
  count: number;
  /** Epoch seconds of the latest review. */
  last_at: number;
}

export interface GitHubGraphData {
  /** Metadata for PRs whose merge commit is already a node (`pr_<sha12>`): the node is updated. */
  mappedPullRequests: PullRequestRow[];
  /** PRs whose merge commit is outside the mined history: new `pr_gh_<n>` nodes. */
  placeholderPullRequests: PullRequestRow[];
  /** Placeholder nodes superseded by a commit node (the PR's merge commit is now in history). */
  retirePlaceholderIds: string[];
  authored: Array<{ author_id: string; pr_id: string }>;
  reviews: ReviewRow[];
  issues: IssueRow[];
  closes: Array<{ pr_id: string; issue_id: string }>;
  /** `(PullRequest)-[:TOUCHES]->(File)` for merge-commit PRs whose own commit lists no files. */
  extraTouches: Array<{ pr_id: string; file_path: string }>;
  /** Decisions stated in review comments / PR descriptions (not yet embedded or written). */
  commentDecisions: MinedDecision[];
  status: 'completed' | 'partial';
  notes: string[];
}

export interface EnrichInput {
  repo: GitHubRepo;
  api: GitHubApi;
  /** Commits already mined from git (newest first). */
  commits: GitCommit[];
  identity: IdentityResolver;
  limits: GitHubLimits;
  /** ISO timestamp: only PRs / issues updated at or after it are fetched (refresh). */
  since?: string;
  /** Pull request number -> id of the node that already carries it in the graph (numbers are unique). */
  lookupExistingPrIds?: (numbers: number[]) => Promise<Map<number, string>>;
  /** Component names that exist in the graph (comment decisions need one to govern). */
  componentNames: Set<string>;
  /** Files changed by a merge commit that `git log` lists without any (best effort). */
  filesForCommit?: (hash: string) => Promise<string[]>;
}

const toEpoch = (iso: string | null | undefined): number => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};

const excerpt = (text: string | null | undefined, max = 300): string =>
  redactSecrets(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Reads pull requests, reviews and issues from GitHub and turns them into graph rows.
 *
 * Best effort by design: any API failure (no access, rate limit, network) is recorded in `notes`,
 * the stage returns what it has (`status: 'partial'`) and the ingestion carries on. It never
 * throws and performs no database writes.
 */
export async function collectGitHubData(input: EnrichInput): Promise<GitHubGraphData> {
  const { repo, api, identity, limits } = input;
  const notes: string[] = [];
  let status: GitHubGraphData['status'] = 'completed';
  let rateLimited = false;

  const note = (message: string) => {
    notes.push(message);
    status = 'partial';
  };

  /** Runs one API step; after a rate limit, every later step is skipped. */
  async function step<T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
    if (rateLimited) return fallback;
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GitHubRateLimitError) {
        rateLimited = true;
        note(`GitHub rate limit reached while reading ${name}; the rest was skipped`);
      } else {
        const code = (err as any)?.status ? ` (HTTP ${(err as any).status})` : '';
        note(`could not read ${name}${code}: ${redactSecrets((err as Error)?.message ?? String(err)).slice(0, 160)}`);
      }
      return fallback;
    }
  }

  const ref = { owner: repo.owner, repo: repo.repo };
  const commitByHash = new Map(input.commits.map((c) => [c.hash, c]));
  const hashesWithAuthor = new Map(input.commits.map((c) => [c.hash, c.author.id]));

  // 1. login -> git author (votes from GitHub's commit attribution)
  if (limits.maxCommitLogins > 0) {
    const logins = await step('commit authors', [], () => api.listCommitLogins({ ...ref, max: limits.maxCommitLogins }));
    for (const c of logins) identity.observe(c.login, hashesWithAuthor.get(c.sha));
  }

  // 2. merged pull requests
  const pulls = await step<GhPull[]>('pull requests', [], () =>
    api.listMergedPulls({ ...ref, max: limits.maxPullRequests, since: input.since })
  );

  const existingPrIdByNumber =
    pulls.length > 0 && input.lookupExistingPrIds
      ? await input.lookupExistingPrIds(pulls.map((p) => p.number)).catch(() => new Map<number, string>())
      : new Map<number, string>();

  // 3. reviews, a few at a time
  const reviewsByPr = new Map<number, GhReview[]>();
  await pool(pulls, limits.concurrency, async (pr) => {
    if (rateLimited) return;
    const reviews = await step(`reviews of #${pr.number}`, null as GhReview[] | null, () =>
      api.listReviews({ ...ref, number: pr.number })
    );
    if (reviews) reviewsByPr.set(pr.number, reviews);
  });

  // 3b. changed files of PRs whose merge commit is outside the mined history (e.g. merged into a
  //     non-default branch): without them their reviews could not be tied to any component
  const filesByPr = new Map<number, string[]>();
  if (api.listPullFiles && limits.maxPullFileLookups > 0) {
    const outside = pulls
      .filter((p) => !(p.merge_commit_sha && commitByHash.has(p.merge_commit_sha)))
      .slice(0, limits.maxPullFileLookups);
    await pool(outside, limits.concurrency, async (pr) => {
      if (rateLimited) return;
      const files = await step(`files of #${pr.number}`, null as string[] | null, () =>
        api.listPullFiles!({ ...ref, number: pr.number })
      );
      if (files) filesByPr.set(pr.number, files);
    });
  }

  // 4. issues (+ the issues merged PRs say they close but that are outside the fetched window)
  const issuesList = await step<GhIssue[]>('issues', [], () =>
    api.listIssues({ ...ref, max: limits.maxIssues, since: input.since })
  );
  const issuesByNumber = new Map(issuesList.map((i) => [i.number, i]));

  // ---- pull requests -> graph nodes ----
  const mapped: PullRequestRow[] = [];
  const placeholders: PullRequestRow[] = [];
  const retire: string[] = [];
  const authored: GitHubGraphData['authored'] = [];
  const reviewRows: ReviewRow[] = [];
  const closes: GitHubGraphData['closes'] = [];
  const extraTouches: GitHubGraphData['extraTouches'] = [];
  const commentSources: CommentSource[] = [];
  const usedNodeIds = new Set<string>();
  const closingByPr: Array<{ prId: string; numbers: number[] }> = [];

  for (const pr of pulls) {
    const sha = pr.merge_commit_sha ?? undefined;
    const commit = sha ? commitByHash.get(sha) : undefined;
    const commitNodeId = commit ? `pr_${commit.hash.slice(0, 12)}` : undefined;
    const existingId = existingPrIdByNumber.get(pr.number);
    const placeholderId = `pr_gh_${pr.number}`;

    // Identity of the node for this PR. The graph keeps PullRequest.number unique, so a number
    // that is already on a node keeps that node; otherwise prefer the commit node, else a placeholder.
    let nodeId: string;
    let isPlaceholder: boolean;
    if (existingId) {
      nodeId = existingId;
      isPlaceholder = existingId.startsWith('pr_gh_');
      if (isPlaceholder && commitNodeId && !usedNodeIds.has(commitNodeId)) {
        // the merge commit has entered the mined history since: the commit node takes over
        retire.push(existingId);
        nodeId = commitNodeId;
        isPlaceholder = false;
      }
    } else if (commitNodeId && !usedNodeIds.has(commitNodeId)) {
      nodeId = commitNodeId;
      isPlaceholder = false;
    } else {
      nodeId = placeholderId;
      isPlaceholder = true;
    }
    if (usedNodeIds.has(nodeId)) continue;
    usedNodeIds.add(nodeId);

    const title = redactSecrets(pr.title).slice(0, 200);
    const row: PullRequestRow = {
      id: nodeId,
      number: pr.number,
      title,
      url: pullUrl(repo, pr.number) || pr.html_url,
      state: 'merged',
      body_excerpt: excerpt(pr.body),
      merged_at: toEpoch(pr.merged_at),
      is_revert: /^revert\b/i.test(pr.title.trim()),
    };
    (isPlaceholder ? placeholders : mapped).push(row);

    // author
    if (pr.user && !isBotLogin(pr.user.login)) {
      authored.push({ author_id: identity.resolve(pr.user.login, pr.user.id), pr_id: nodeId });
    }

    // reviewers (humans other than the author; one edge per reviewer and PR)
    const authorId = pr.user && !isBotLogin(pr.user.login) ? identity.resolve(pr.user.login, pr.user.id) : undefined;
    const perReviewer = new Map<string, ReviewRow>();
    for (const review of reviewsByPr.get(pr.number) ?? []) {
      if (!review.user || isBotLogin(review.user.login)) continue;
      if (review.state.toUpperCase() === 'PENDING') continue; // not submitted
      const reviewerId = identity.resolve(review.user.login, review.user.id);
      if (reviewerId === authorId) continue; // answering comments on your own PR is not a review
      const at = toEpoch(review.submitted_at);
      const prev = perReviewer.get(reviewerId);
      if (!prev) {
        perReviewer.set(reviewerId, { reviewer_id: reviewerId, pr_id: nodeId, state: review.state.toUpperCase(), count: 1, last_at: at });
      } else {
        prev.count += 1;
        if (at >= prev.last_at) {
          prev.state = review.state.toUpperCase();
          prev.last_at = at;
        }
      }
    }
    reviewRows.push(...perReviewer.values());

    // files of a merge commit (git log lists none for merges) or, for a PR outside the mined
    // history, the files GitHub reports for it
    let files = commit?.files.map((f) => f.path) ?? [];
    if (commit && files.length === 0 && input.filesForCommit) {
      try {
        files = await input.filesForCommit(commit.hash);
      } catch {
        files = [];
      }
      for (const file_path of files) extraTouches.push({ pr_id: nodeId, file_path });
    } else if (!commit && filesByPr.has(pr.number)) {
      files = filesByPr.get(pr.number)!;
      for (const file_path of files) extraTouches.push({ pr_id: nodeId, file_path });
    }

    // closing references
    const numbers = parseClosingReferences(`${pr.title}\n${pr.body ?? ''}`, ref);
    if (numbers.length > 0) closingByPr.push({ prId: nodeId, numbers });

    // decisions stated in the discussion
    const counts = new Map<string, number>();
    for (const file of files) {
      const component = resolveComponentForFile(file);
      if (input.componentNames.has(component)) counts.set(component, (counts.get(component) ?? 0) + 1);
    }
    const component = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    commentSources.push({
      prId: nodeId, prNumber: pr.number, component, login: pr.user?.login, text: pr.body,
      url: pullUrl(repo, pr.number), at: toEpoch(pr.merged_at),
    });
    for (const review of reviewsByPr.get(pr.number) ?? []) {
      commentSources.push({
        prId: nodeId, prNumber: pr.number, component, login: review.user?.login, text: review.body,
        url: review.html_url ?? pullUrl(repo, pr.number), at: toEpoch(review.submitted_at) || toEpoch(pr.merged_at),
      });
    }
  }

  // ---- issues ----
  const lookups = new Set<number>();
  for (const { numbers } of closingByPr) {
    for (const n of numbers) {
      if (!issuesByNumber.has(n) && lookups.size < limits.maxIssueLookups) lookups.add(n);
    }
  }
  for (const n of lookups) {
    const issue = await step(`issue #${n}`, null as GhIssue | null, () => api.getIssue({ ...ref, number: n }));
    if (issue) issuesByNumber.set(issue.number, issue);
  }

  const issueRows: IssueRow[] = [...issuesByNumber.values()].map((i) => ({
    id: `issue_${i.number}`,
    number: i.number,
    title: redactSecrets(i.title).slice(0, 200),
    state: i.state,
    url: issueUrl(repo, i.number),
    created_at: toEpoch(i.created_at),
  }));
  for (const { prId, numbers } of closingByPr) {
    for (const n of numbers) {
      // a closing keyword can point at a pull request (#n) or an unknown issue: only real, known issues are linked
      if (issuesByNumber.has(n)) closes.push({ pr_id: prId, issue_id: `issue_${n}` });
    }
  }

  return {
    mappedPullRequests: mapped,
    placeholderPullRequests: placeholders,
    retirePlaceholderIds: retire,
    authored,
    reviews: reviewRows,
    issues: issueRows,
    closes,
    extraTouches,
    commentDecisions: mineCommentDecisions(commentSources),
    status,
    notes,
  };
}
