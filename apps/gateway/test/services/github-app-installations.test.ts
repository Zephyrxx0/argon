import { describe, it, expect, vi } from 'vitest';
import { GitHubAppService } from '../../src/services/github-app.js';

/** Builds a service with a stubbed App Octokit + installation-repo fetch. */
function makeService(installations: Array<{ id: number; login: string }>, reposByInstall: Record<number, string[]>) {
  const svc = new GitHubAppService({
    appId: '1',
    privateKey: 'pk',
    authStrategy: async ({ installationId }) => ({ token: `tok-${installationId}`, expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
    octokitFactory: (() => ({
      rest: {
        apps: {
          listReposAccessibleToInstallation: async () => ({ data: { repositories: [] } }),
        },
      },
    })) as any,
  });
  // stub the App-level Octokit used by listAppInstallations
  (svc as any).appOctokit = {
    rest: { apps: { listInstallations: async () => ({ data: installations.map((i) => ({ id: i.id, account: { login: i.login } })) }) } },
  };
  // stub installation-repo resolution to the fixture
  vi.spyOn(svc, 'getInstallationRepositories').mockImplementation(async (id: number) =>
    (reposByInstall[id] || []).map((full) => ({
      id: 1, name: full.split('/')[1]!, fullName: full, private: false, defaultBranch: 'main',
      owner: { login: full.split('/')[0]!, avatarUrl: '' }, description: null, htmlUrl: '', installationId: id,
    }))
  );
  return svc;
}

describe('GitHubAppService App-installation repo resolution', () => {
  it('lists repos for a login by matching the App installation (case-insensitive)', async () => {
    const svc = makeService(
      [{ id: 172, login: 'Zephyrxx0' }, { id: 99, login: 'someone-else' }],
      { 172: ['Zephyrxx0/treads', 'Zephyrxx0/gavel'] }
    );
    const repos = await svc.getRepositoriesForLogin('zephyrxx0');
    expect(repos.map((r) => r.fullName)).toEqual(['Zephyrxx0/treads', 'Zephyrxx0/gavel']);
  });

  it('returns [] when the App is not installed for that login', async () => {
    const svc = makeService([{ id: 99, login: 'other' }], { 99: ['other/x'] });
    expect(await svc.getRepositoriesForLogin('zephyrxx0')).toEqual([]);
    expect(await svc.getRepositoriesForLogin('')).toEqual([]);
  });

  it('getUserRepositories prefers the App path (login) over the user token', async () => {
    const svc = makeService([{ id: 172, login: 'Zephyrxx0' }], { 172: ['Zephyrxx0/treads'] });
    const getUserInstallations = vi.spyOn(svc, 'getUserInstallations');
    const repos = await svc.getUserRepositories('user-token', undefined, 'Zephyrxx0');
    expect(repos.map((r) => r.fullName)).toEqual(['Zephyrxx0/treads']);
    // the failing /user/installations path must NOT be used when the App path succeeds
    expect(getUserInstallations).not.toHaveBeenCalled();
  });
});
