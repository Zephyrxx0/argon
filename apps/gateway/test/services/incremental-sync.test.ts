import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IncrementalSyncService,
  detectRevertedSha,
  isAdrPath,
  extractExplicitFiles,
} from '../../src/services/incremental-sync.js';

describe('IncrementalSyncService (Task 08-02-02, Task 08-02-03, SYNC-02, SYNC-03)', () => {
  let mockGraphClient: any;
  let mockGitHubAppService: any;
  let mockEmbedder: any;
  let syncService: IncrementalSyncService;

  beforeEach(() => {
    mockGraphClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mockGitHubAppService = {
      getInstallationOctokit: vi.fn(),
    };

    mockEmbedder = {
      embed: vi.fn().mockResolvedValue({
        vector: new Array(512).fill(0.05),
        dim: 512,
      }),
    };

    syncService = new IncrementalSyncService({
      graphClient: mockGraphClient,
      githubAppService: mockGitHubAppService,
      embedder: mockEmbedder,
    });
  });

  describe('Utility Functions', () => {
    it('detectRevertedSha extracts sha from git revert message', () => {
      const msg = 'Revert "feat: broken feature"\n\nThis reverts commit a1b2c3d4e5f6789012345678901234567890abcd.';
      expect(detectRevertedSha(msg)).toBe('a1b2c3d4e5f6789012345678901234567890abcd');
      expect(detectRevertedSha('feat: normal commit')).toBeUndefined();
    });

    it('isAdrPath identifies ADR and decision markdown paths', () => {
      expect(isAdrPath('docs/adr/0001-record-architecture.md')).toBe(true);
      expect(isAdrPath('docs/decisions/0002-auth.md')).toBe(true);
      expect(isAdrPath('decisions/storage.md')).toBe(true);
      expect(isAdrPath('src/components/button.adr.md')).toBe(true);
      expect(isAdrPath('src/components/button.tsx')).toBe(false);
      expect(isAdrPath('README.md')).toBe(false);
    });

    it('extractExplicitFiles extracts relative file paths from text', () => {
      const text = `
        We modified \`apps/gateway/src/app.ts\` and \`packages/graph/src/client.ts\`.
        Also see docs at https://example.com/not-a-file.
      `;
      const files = extractExplicitFiles(text);
      expect(files).toContain('apps/gateway/src/app.ts');
      expect(files).toContain('packages/graph/src/client.ts');
    });
  });

  describe('processPushSync (SYNC-02)', () => {
    it('ingests commits, files, touches and co-change coupling', async () => {
      const payload = {
        commits: [
          {
            id: 'commit-sha-1',
            message: 'feat: add route',
            author: { name: 'Alice', email: 'alice@argon.dev' },
            timestamp: '2026-10-16T10:00:00Z',
            added: ['apps/web/new-page.tsx'],
            modified: ['apps/web/app.tsx'],
            removed: [],
          },
        ],
      };

      const result = await syncService.processPushSync(payload, 'test-ws');

      expect(result.trigger).toBe('push');
      expect(result.updated.commits).toEqual(['commit-sha-1']);
      expect(result.updated.files).toContain('apps/web/new-page.tsx');
      expect(result.updated.files).toContain('apps/web/app.tsx');

      // Graph queries were invoked for commits and pairwise coupling
      expect(mockGraphClient.query).toHaveBeenCalledTimes(2);
      expect(mockGraphClient.query).toHaveBeenNthCalledWith(
        1,
        'test-ws',
        expect.stringContaining('UNWIND $commits AS c'),
        expect.objectContaining({ workspaceId: 'test-ws' }),
      );
      expect(mockGraphClient.query).toHaveBeenNthCalledWith(
        2,
        'test-ws',
        expect.stringContaining('UNWIND $pairs AS pair'),
        expect.objectContaining({
          workspaceId: 'test-ws',
          pairs: [{ fileA: 'apps/web/new-page.tsx', fileB: 'apps/web/app.tsx' }],
        }),
      );
    });

    it('detects revert commits and marks removed files as deleted', async () => {
      const payload = {
        commits: [
          {
            id: 'revert-sha-2',
            message: 'Revert "feat: broken"\n\nThis reverts commit a1b2c3d4e5f6789012345678901234567890abcd.',
            author: { name: 'Bob', email: 'bob@argon.dev' },
            timestamp: '2026-10-16T11:00:00Z',
            added: [],
            modified: [],
            removed: ['apps/web/old-page.tsx'],
          },
        ],
      };

      const result = await syncService.processPushSync(payload, 'test-ws');

      expect(result.updated.files).toContain('apps/web/old-page.tsx');
      // Incremental commit query + link revert query
      expect(mockGraphClient.query).toHaveBeenCalledWith(
        'test-ws',
        expect.stringContaining('MATCH (cm:Commit { id: $sha'),
        expect.objectContaining({
          sha: 'revert-sha-2',
          revertsSha: 'a1b2c3d4e5f6789012345678901234567890abcd',
        }),
      );
    });

    it('skips co-change coupling calculation for mega-commits touching >50 files', async () => {
      const largeFileList = Array.from({ length: 60 }, (_, i) => `file-${i}.ts`);
      const payload = {
        commits: [
          {
            id: 'megacommit-1',
            message: 'refactor: project wide rename',
            author: { name: 'Charlie', email: 'charlie@argon.dev' },
            added: [],
            modified: largeFileList,
            removed: [],
          },
        ],
      };

      await syncService.processPushSync(payload, 'test-ws');

      // Only commit ingest query was run, no pairwise coupling update
      expect(mockGraphClient.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('processPullRequestSync (SYNC-03)', () => {
    it('detects merged PR with ADR modifications, advances supersession validity, and embeds decision', async () => {
      const adrContent = `
# ADR-0005: Real-Time Sync via SSE

* Status: accepted
* Supersedes: ADR-0004
* Date: 2026-10-16

## Context
Need real-time notifications. Touch \`apps/gateway/src/routes/events.ts\`.

## Decision
Use Server-Sent Events with workspace isolation.
`;

      const mockOctokit = {
        rest: {
          pulls: {
            listFiles: vi.fn().mockResolvedValue({
              data: [
                { filename: 'docs/adr/0005-real-time-sync.md' },
                { filename: 'apps/gateway/src/routes/events.ts' },
              ],
            }),
          },
          repos: {
            getContent: vi.fn().mockResolvedValue({
              data: {
                content: Buffer.from(adrContent, 'utf-8').toString('base64'),
              },
            }),
          },
        },
      };

      mockGitHubAppService.getInstallationOctokit.mockResolvedValue(mockOctokit);

      const payload = {
        action: 'closed',
        installation: { id: 12345 },
        repository: { name: 'argon', full_name: 'org/argon' },
        pull_request: {
          number: 10,
          merged: true,
          merged_at: '2026-10-16T12:00:00Z',
          merge_commit_sha: 'merge-sha-10',
        },
      };

      const result = await syncService.processPullRequestSync(payload, 'test-ws');

      expect(result.trigger).toBe('pull_request');
      expect(result.updated.commits).toEqual(['merge-sha-10']);
      expect(result.updated.files).toContain('docs/adr/0005-real-time-sync.md');
      expect(result.superseded).toContain('ADR-0004');

      // Embedder was called
      expect(mockEmbedder.embed).toHaveBeenCalledTimes(1);

      // Graph queries were called for upsert decision and advance supersession
      expect(mockGraphClient.query).toHaveBeenCalledWith(
        'test-ws',
        expect.stringContaining('MERGE (d:Decision'),
        expect.objectContaining({
          workspaceId: 'test-ws',
          validFrom: '2026-10-16T12:00:00Z',
        }),
      );

      expect(mockGraphClient.query).toHaveBeenCalledWith(
        'test-ws',
        expect.stringContaining('SET old.valid_to = $mergedAt'),
        expect.objectContaining({
          workspaceId: 'test-ws',
          oldDecisionId: 'ADR-0004',
          mergedAt: '2026-10-16T12:00:00Z',
        }),
      );
    });

    it('completes cleanly when merged PR has no ADR files', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            listFiles: vi.fn().mockResolvedValue({
              data: [{ filename: 'apps/web/page.tsx' }, { filename: 'packages/graph/client.ts' }],
            }),
          },
        },
      };

      mockGitHubAppService.getInstallationOctokit.mockResolvedValue(mockOctokit);

      const payload = {
        action: 'closed',
        installation: { id: 12345 },
        repository: { name: 'argon', full_name: 'org/argon' },
        pull_request: {
          number: 11,
          merged: true,
          merged_at: '2026-10-16T13:00:00Z',
          merge_commit_sha: 'merge-sha-11',
        },
      };

      const result = await syncService.processPullRequestSync(payload, 'test-ws');

      expect(result.updated.decisions).toEqual([]);
      expect(result.superseded).toEqual([]);
      expect(result.updated.files).toEqual(['apps/web/page.tsx', 'packages/graph/client.ts']);
      expect(mockEmbedder.embed).not.toHaveBeenCalled();
    });
  });
});
