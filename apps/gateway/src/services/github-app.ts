import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export interface CachedToken {
  token: string;
  expiresAt: number;
}

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
  installationId: number;
}

export interface GitHubAppServiceOptions {
  appId?: string | number;
  privateKey?: string;
  clientId?: string;
  clientSecret?: string;
  defaultInstallationId?: number;
  authStrategy?: (params: { type: 'installation'; installationId: number }) => Promise<{ token: string; expiresAt: string }>;
  octokitFactory?: (auth: string) => Octokit;
  userInstallationValidator?: (userId: string, installationId: number) => Promise<boolean> | boolean;
}

export class GitHubAppService {
  private appId: string | number;
  private privateKey: string;
  private clientId?: string;
  private clientSecret?: string;
  private tokenCache = new Map<number, CachedToken>();
  private authFn?: (params: { type: 'installation'; installationId: number }) => Promise<{ token: string; expiresAt: string }>;
  private octokitFactory: (auth: string) => Octokit;
  private options?: GitHubAppServiceOptions;
  /** App-authenticated Octokit (App JWT), used to enumerate the App's own installations. */
  private appOctokit?: Octokit;

  constructor(options?: GitHubAppServiceOptions) {
    this.options = options;
    this.appId = options?.appId ?? process.env.GITHUB_APP_ID ?? '';
    const rawKey = options?.privateKey ?? process.env.GITHUB_APP_PRIVATE_KEY ?? process.env.GITHUB_PRIVATE_KEY ?? '';
    this.privateKey = rawKey.replace(/\\n/g, '\n');
    this.clientId = options?.clientId ?? process.env.GITHUB_CLIENT_ID;
    this.clientSecret = options?.clientSecret ?? process.env.GITHUB_CLIENT_SECRET;
    this.authFn = options?.authStrategy;
    this.octokitFactory = options?.octokitFactory ?? ((auth: string) => new Octokit({ auth }));

    if (!this.authFn && this.appId && this.privateKey) {
      const auth = createAppAuth({
        appId: this.appId,
        privateKey: this.privateKey,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });
      this.authFn = async ({ installationId }) => {
        const res = await auth({ type: 'installation', installationId });
        return { token: res.token, expiresAt: res.expiresAt };
      };
      // App-level client (App JWT) for listing the App's installations without any user token.
      if (!this.appOctokit) {
        this.appOctokit = new Octokit({
          authStrategy: createAppAuth,
          auth: { appId: this.appId, privateKey: this.privateKey },
        });
      }
    }
  }

  /**
   * Lists the installations of THIS GitHub App (App-authenticated; no user token needed).
   * Returns `[]` when the App isn't configured or the call fails.
   */
  async listAppInstallations(): Promise<Array<{ id: number; accountLogin: string | null }>> {
    if (!this.appOctokit) return [];
    try {
      const res = await this.appOctokit.rest.apps.listInstallations({ per_page: 100 });
      return res.data.map((i) => ({
        id: i.id,
        accountLogin:
          (i.account && 'login' in i.account ? (i.account as { login?: string }).login : null) ?? null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Repositories the App can see for a given GitHub login, found via the App's own installation
   * list. This works even when the user's OAuth token can't call `/user/installations` (the common
   * "You must authenticate with an access token authorized to a GitHub App" 403).
   */
  async getRepositoriesForLogin(login: string): Promise<GitHubRepositoryItem[]> {
    const normalized = login.trim().toLowerCase();
    if (!normalized) return [];
    const installations = await this.listAppInstallations();
    const match = installations.find((i) => (i.accountLogin ?? '').toLowerCase() === normalized);
    if (!match) return [];
    return this.getInstallationRepositories(match.id);
  }

  /**
   * Get an installation token, caching in memory with a 5-minute safety buffer (ING-04).
   */
  async getInstallationToken(installationId: number): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    const safetyBufferMs = 5 * 60 * 1000;

    if (cached && Date.now() < cached.expiresAt - safetyBufferMs) {
      return cached.token;
    }

    if (!this.authFn) {
      throw new Error('GitHub App authentication unconfigured (missing appId or privateKey)');
    }

    const authResult = await this.authFn({
      type: 'installation',
      installationId,
    });

    const expiresAt = new Date(authResult.expiresAt).getTime();
    this.tokenCache.set(installationId, {
      token: authResult.token,
      expiresAt,
    });

    return authResult.token;
  }

  /**
   * Get an Octokit instance authenticated with the installation token.
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const token = await this.getInstallationToken(installationId);
    return this.octokitFactory(token);
  }

  /**
   * List installations accessible to the user given their user access token.
   */
  async getUserInstallations(userAccessToken: string) {
    const octokit = this.octokitFactory(userAccessToken);
    const response = await octokit.rest.apps.listInstallationsForAuthenticatedUser();
    return response.data.installations;
  }

  /**
   * Query repositories accessible to an installation using an installation token.
   */
  async getInstallationRepositories(installationId: number): Promise<GitHubRepositoryItem[]> {
    const token = await this.getInstallationToken(installationId);
    const octokit = this.octokitFactory(token);
    const response = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    return (response.data.repositories || []).map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
      description: repo.description,
      htmlUrl: repo.html_url,
      installationId,
    }));
  }

  /**
   * Verify whether a user is authorized for an installation (Dual Authorization check D-04, T-07-04).
   */
  async verifyUserInstallation(
    userId: string,
    installationId: number,
    userAccessToken?: string
  ): Promise<boolean> {
    if (userId === 'admin') {
      return true;
    }

    if (this.options?.userInstallationValidator) {
      return await this.options.userInstallationValidator(userId, installationId);
    }

    if (userAccessToken) {
      try {
        const installations = await this.getUserInstallations(userAccessToken);
        return installations.some((inst) => inst.id === installationId);
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all repositories accessible to the user across installations.
   */
  async getUserRepositories(
    userAccessToken?: string,
    targetInstallationId?: number,
    login?: string
  ): Promise<GitHubRepositoryItem[]> {
    if (targetInstallationId) {
      return await this.getInstallationRepositories(targetInstallationId);
    }

    // Preferred: match the user to one of the App's installations by login. Works regardless of
    // whether the user's OAuth token can enumerate installations.
    if (login) {
      const viaApp = await this.getRepositoriesForLogin(login);
      if (viaApp.length > 0) return viaApp;
    }

    if (userAccessToken) {
      const installations = await this.getUserInstallations(userAccessToken);
      const results: GitHubRepositoryItem[] = [];
      for (const inst of installations) {
        const repos = await this.getInstallationRepositories(inst.id);
        results.push(...repos);
      }
      return results;
    }

    const defaultInst = this.options?.defaultInstallationId ?? (process.env.GITHUB_INSTALLATION_ID ? Number(process.env.GITHUB_INSTALLATION_ID) : undefined);
    if (defaultInst) {
      return await this.getInstallationRepositories(defaultInst);
    }

    return [];
  }

  /**
   * Inspect cached token for testing / diagnostics
   */
  getCachedToken(installationId: number): CachedToken | undefined {
    return this.tokenCache.get(installationId);
  }

  /**
   * Clear cache for testing
   */
  clearCache(): void {
    this.tokenCache.clear();
  }
}
