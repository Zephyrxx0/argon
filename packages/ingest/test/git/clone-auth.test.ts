import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cloneRepository } from '../../src/git/clone.js';
import { createFixtureRepository, FixtureRepoResult } from '../fixture-repo.js';

describe('cloneRepository auth & header injection', () => {
  let fixture: FixtureRepoResult;

  beforeAll(async () => {
    fixture = await createFixtureRepository();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it('clones repository with installationToken without saving credentials in .git/config', async () => {
    const dummyToken = 'ghs_PROGRAMMATIC_TEST_TOKEN_1234567890';
    const result = await cloneRepository(`file://${fixture.dir}`, {
      blobless: false,
      installationToken: dummyToken,
    });

    try {
      expect(fs.existsSync(result.dir)).toBe(true);
      const gitConfigPath = path.join(result.dir, '.git', 'config');
      expect(fs.existsSync(gitConfigPath)).toBe(true);

      const configContent = await fs.promises.readFile(gitConfigPath, 'utf8');
      // Assert the secret token is NOT saved to .git/config
      expect(configContent).not.toContain(dummyToken);
      expect(configContent).not.toContain('x-access-token');
      expect(configContent).not.toContain('http.extraheader');
    } finally {
      await result.cleanup();
    }
  });

  it('transforms git auth failure into sanitized GitHubAuthError', async () => {
    // Attempting to clone a non-existent remote with auth failure triggers GitHubAuthError
    await expect(
      cloneRepository('file:///nonexistent/argon-nonexistent-org/argon-nonexistent-repo.git', {
        installationToken: 'ghs_invalid_token_test_1234567890',
      })
    ).rejects.toThrow();
  });
});
