import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cloneRepository } from '../../src/git/clone.js';
import { sanitizeError } from '../../src/git/redact.js';
import { runIngestion } from '../../src/pipeline.js';
import { createFixtureRepository, FixtureRepoResult } from '../fixture-repo.js';

describe('Canary Secret Leak Prevention Tests (ING-05)', () => {
  const CANARY_SECRET = 'ghs_CANARY_TEST_SECRET_DO_NOT_LEAK_9876543210';
  let fixture: FixtureRepoResult;

  beforeAll(async () => {
    fixture = await createFixtureRepository();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it('guarantees canary secret never leaks in thrown error message or stack trace', async () => {
    let capturedError: Error | null = null;
    try {
      await cloneRepository('file:///nonexistent/argon-fake-tenant/argon-private-repo.git', {
        installationToken: CANARY_SECRET,
      });
    } catch (err: any) {
      capturedError = err;
    }

    expect(capturedError).not.toBeNull();
    expect(capturedError!.message).not.toContain(CANARY_SECRET);
    if (capturedError!.stack) {
      expect(capturedError!.stack).not.toContain(CANARY_SECRET);
    }

    // Verify sanitizeError explicitly replaces canary token with redacted placeholder
    const simulatedErrorWithSecret = new Error(`fatal: authentication failed for ${CANARY_SECRET}`);
    const sanitized = sanitizeError(simulatedErrorWithSecret);
    expect(sanitized.message).not.toContain(CANARY_SECRET);
    expect(sanitized.message).toContain('[REDACTED_SECRET]');
  });

  it('guarantees canary secret is not printed to console.log, console.warn, or console.error during pipeline failure', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    // Mock client to prevent actual FalkorDB connections during failed clone test
    const mockClient: any = {
      ping: vi.fn().mockResolvedValue(true),
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ records: [] }),
    };

    let pipelineError: Error | null = null;
    try {
      await runIngestion({
        repoUrl: `https://x-access-token:${CANARY_SECRET}@github.com/fake/private-repo.git`,
        workspaceId: 'test-canary-ws',
        installationToken: CANARY_SECRET,
        client: mockClient,
      });
    } catch (err: any) {
      pipelineError = err;
    }

    expect(pipelineError).not.toBeNull();

    // Check all intercepted console outputs
    const allLoggedContent = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].map(String).join(' ');

    expect(allLoggedContent).not.toContain(CANARY_SECRET);

    // Verify mockClient.query recorded redacted job error
    const updateJobCalls = mockClient.query.mock.calls;
    for (const call of updateJobCalls) {
      const params = call[2];
      if (params?.error) {
        expect(params.error).not.toContain(CANARY_SECRET);
      }
      if (params?.repoUrl) {
        expect(params.repoUrl).not.toContain(CANARY_SECRET);
      }
    }

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('guarantees canary secret never persists in .git/config on disk', async () => {
    const result = await cloneRepository(`file://${fixture.dir}`, {
      blobless: false,
      installationToken: CANARY_SECRET,
    });

    try {
      const configPath = path.join(result.dir, '.git', 'config');
      expect(fs.existsSync(configPath)).toBe(true);

      const configText = await fs.promises.readFile(configPath, 'utf8');
      expect(configText).not.toContain(CANARY_SECRET);
    } finally {
      await result.cleanup();
    }
  });
});
