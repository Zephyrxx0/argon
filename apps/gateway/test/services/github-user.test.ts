import { describe, it, expect, vi } from 'vitest';
import { GitHubUserService } from '../../src/services/github-user.js';

/** Octokit stub returning paged repo lists and a single-repo get. */
function stubOctokit(pages: any[][], getImpl?: (args: { owner: string; repo: string }) => any) {
  const listForAuthenticatedUser = vi.fn(async ({ page }: { page: number }) => ({ data: pages[page - 1] ?? [] }));
  const get = vi.fn(async (args: { owner: string; repo: string }) => {
    if (getImpl) return { data: getImpl(args) };
    throw Object.assign(new Error('Not Found'), { status: 404 });
  });
  return {
    octokit: { rest: { repos: { listForAuthenticatedUser, get } } },
    listForAuthenticatedUser,
    get,
  };
}

const repo = (id: number, full: string, priv = false) => ({
  id,
  name: full.split('/')[1],
  full_name: full,
  private: priv,
  default_branch: 'main',
  owner: { login: full.split('/')[0], avatar_url: 'a' },
  description: null,
  html_url: `https://github.com/${full}`,
});

describe('GitHubUserService (OAuth user token)', () => {
  it('lists public + private repos and paginates until a short page', async () => {
    const full = Array.from({ length: 100 }, (_, i) => repo(i + 1, `me/r${i + 1}`, i % 2 === 0));
    const { octokit, listForAuthenticatedUser } = stubOctokit([full, [repo(101, 'me/last', true)]]);
    const svc = new GitHubUserService({ octokitFactory: () => octokit as any });

    const repos = await svc.listUserRepositories('gho_x');
    expect(repos).toHaveLength(101);
    expect(repos.some((r) => r.private)).toBe(true);
    expect(repos.at(-1)!.fullName).toBe('me/last');
    // page 1 (full) then page 2 (short) => stop; no 3rd call
    expect(listForAuthenticatedUser).toHaveBeenCalledTimes(2);
    // requested with all visibility + affiliations
    expect(listForAuthenticatedUser.mock.calls[0]![0]).toMatchObject({
      visibility: 'all',
      affiliation: 'owner,collaborator,organization_member',
    });
  });

  it('respects the maxRepos cap', async () => {
    const page = Array.from({ length: 100 }, (_, i) => repo(i + 1, `me/r${i + 1}`));
    const { octokit } = stubOctokit([page, page, page]);
    const svc = new GitHubUserService({ octokitFactory: () => octokit as any, maxRepos: 150 });
    const repos = await svc.listUserRepositories('gho_x');
    expect(repos).toHaveLength(150);
  });

  it('getRepository returns metadata when readable, null otherwise', async () => {
    const { octokit } = stubOctokit([], ({ owner, repo: r }) => repo(5, `${owner}/${r}`, true));
    const svc = new GitHubUserService({ octokitFactory: () => octokit as any });
    const meta = await svc.getRepository('gho_x', 'Zephyrxx0', 'treads');
    expect(meta).toMatchObject({ fullName: 'Zephyrxx0/treads', private: true });

    const { octokit: o2 } = stubOctokit([]); // get throws 404
    const svc2 = new GitHubUserService({ octokitFactory: () => o2 as any });
    expect(await svc2.getRepository('gho_x', 'no', 'repo')).toBeNull();
  });
});
