import { Octokit } from '@octokit/rest';

export interface GitHubRepositoryItem {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
  description: string | null;
  htmlUrl: string;
}

export interface GitHubUserServiceOptions {
  /** Injectable Octokit factory for tests. */
  octokitFactory?: (auth: string) => Octokit;
  /** Hard cap on repositories returned (pagination safety). */
  maxRepos?: number;
}

/**
 * Lists and verifies repositories using the signed-in user's own OAuth token.
 *
 * This replaces the GitHub App: no App installation is required, so the user does not have to
 * install anything to analyze their repos. The login flow requests the `repo` scope, which lets
 * the user's token read (and clone) every repository they can access — public and private,
 * personal and organization. Argon only ever reads.
 */
export class GitHubUserService {
  private octokitFactory: (auth: string) => Octokit;
  private maxRepos: number;

  constructor(options?: GitHubUserServiceOptions) {
    this.octokitFactory = options?.octokitFactory ?? ((auth: string) => new Octokit({ auth }));
    this.maxRepos = options?.maxRepos ?? 500;
  }

  /**
   * Every repository the user can access (owner, collaborator, org member), newest activity
   * first. Paginates up to `maxRepos`.
   */
  async listUserRepositories(userAccessToken: string): Promise<GitHubRepositoryItem[]> {
    const octokit = this.octokitFactory(userAccessToken);
    const perPage = 100;
    const items: GitHubRepositoryItem[] = [];

    for (let page = 1; items.length < this.maxRepos; page++) {
      const res = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        page,
        sort: 'pushed',
        affiliation: 'owner,collaborator,organization_member',
        visibility: 'all',
      });
      const batch = res.data ?? [];
      for (const repo of batch) {
        items.push({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch ?? 'main',
          owner: { login: repo.owner?.login ?? '', avatarUrl: repo.owner?.avatar_url ?? '' },
          description: repo.description ?? null,
          htmlUrl: repo.html_url,
        });
      }
      if (batch.length < perPage) break;
    }

    return items.slice(0, this.maxRepos);
  }

  /**
   * Confirms the user's token can read `owner/repo` (so we only ingest repos they can actually
   * clone). Returns the canonical clone metadata, or null when inaccessible.
   */
  async getRepository(
    userAccessToken: string,
    owner: string,
    repo: string
  ): Promise<GitHubRepositoryItem | null> {
    try {
      const octokit = this.octokitFactory(userAccessToken);
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        private: data.private,
        defaultBranch: data.default_branch ?? 'main',
        owner: { login: data.owner?.login ?? '', avatarUrl: data.owner?.avatar_url ?? '' },
        description: data.description ?? null,
        htmlUrl: data.html_url,
      };
    } catch {
      return null;
    }
  }
}
