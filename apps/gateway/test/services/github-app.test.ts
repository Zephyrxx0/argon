import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubAppService } from '../../src/services/github-app.js';

describe('GitHubAppService (Task 07-02-01, ING-04)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('mints installation token and caches it in memory', async () => {
    const mockAuthStrategy = vi.fn().mockResolvedValue({
      token: 'ghs_mock_token_12345',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour ahead
    });

    const service = new GitHubAppService({
      appId: '123456',
      privateKey: 'dummy-key',
      authStrategy: mockAuthStrategy,
    });

    const token1 = await service.getInstallationToken(101);
    expect(token1).toBe('ghs_mock_token_12345');
    expect(mockAuthStrategy).toHaveBeenCalledTimes(1);
    expect(mockAuthStrategy).toHaveBeenCalledWith({
      type: 'installation',
      installationId: 101,
    });

    // Consecutive call within TTL should return cached token without calling auth again
    const token2 = await service.getInstallationToken(101);
    expect(token2).toBe('ghs_mock_token_12345');
    expect(mockAuthStrategy).toHaveBeenCalledTimes(1);
  });

  it('refreshes token when cache is within the 5-minute safety buffer', async () => {
    // Token expiring in 4 minutes (inside the 5-min buffer)
    const mockAuthStrategy = vi
      .fn()
      .mockResolvedValueOnce({
        token: 'ghs_token_about_to_expire',
        expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      })
      .mockResolvedValueOnce({
        token: 'ghs_fresh_token_67890',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

    const service = new GitHubAppService({
      appId: '123456',
      privateKey: 'dummy-key',
      authStrategy: mockAuthStrategy,
    });

    const token1 = await service.getInstallationToken(202);
    expect(token1).toBe('ghs_token_about_to_expire');
    expect(mockAuthStrategy).toHaveBeenCalledTimes(1);

    // Second call should detect expired/near-expiry token and request fresh one
    const token2 = await service.getInstallationToken(202);
    expect(token2).toBe('ghs_fresh_token_67890');
    expect(mockAuthStrategy).toHaveBeenCalledTimes(2);
  });

  it('queries repositories accessible to installation and returns normalized metadata', async () => {
    const mockAuthStrategy = vi.fn().mockResolvedValue({
      token: 'ghs_valid_token_303',
      expiresAt: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
    });

    const mockOctokit: any = {
      rest: {
        apps: {
          listReposAccessibleToInstallation: vi.fn().mockResolvedValue({
            data: {
              total_count: 2,
              repositories: [
                {
                  id: 111,
                  name: 'private-repo',
                  full_name: 'acme/private-repo',
                  private: true,
                  default_branch: 'main',
                  owner: { login: 'acme', avatar_url: 'https://github.com/acme.png' },
                  description: 'Core secret backend',
                  html_url: 'https://github.com/acme/private-repo',
                },
                {
                  id: 222,
                  name: 'public-docs',
                  full_name: 'acme/public-docs',
                  private: false,
                  default_branch: 'master',
                  owner: { login: 'acme', avatar_url: 'https://github.com/acme.png' },
                  description: 'Documentation',
                  html_url: 'https://github.com/acme/public-docs',
                },
              ],
            },
          }),
        },
      },
    };

    const service = new GitHubAppService({
      appId: '123456',
      privateKey: 'dummy-key',
      authStrategy: mockAuthStrategy,
      octokitFactory: () => mockOctokit,
    });

    const repos = await service.getInstallationRepositories(303);
    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({
      id: 111,
      name: 'private-repo',
      fullName: 'acme/private-repo',
      private: true,
      defaultBranch: 'main',
      owner: { login: 'acme', avatarUrl: 'https://github.com/acme.png' },
      description: 'Core secret backend',
      htmlUrl: 'https://github.com/acme/private-repo',
      installationId: 303,
    });
    expect(repos[1].private).toBe(false);
  });

  it('throws helpful error when GitHub App credentials are not configured', async () => {
    const service = new GitHubAppService({
      appId: '',
      privateKey: '',
    });

    await expect(service.getInstallationToken(999)).rejects.toThrow(
      'GitHub App authentication unconfigured'
    );
  });
});
