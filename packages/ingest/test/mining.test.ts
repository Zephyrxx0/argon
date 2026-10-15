import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  parseAdrDocument,
  resolveSupersessions,
  scanAdrFiles,
  mineReverts,
  mineCommitDecisions,
  embedDecisions,
  type MinedDecision,
  type GitCommit,
} from '../src/index.js';

describe('decision mining & temporal windows', () => {
  describe('markdown ADR parsing', () => {
    it('parses frontmatter, status, and supersedes links', () => {
      const adrMarkdown = `---
title: "ADR-002: Use FalkorDB Graph Engine"
status: "accepted"
supersedes: "ADR-001"
---

# ADR-002: Use FalkorDB Graph Engine

## Context
We need a graph database with openCypher and vector indexing.

## Decision
We select FalkorDB over Neo4j.
`;
      const decision = parseAdrDocument('docs/adr/002-falkordb.md', adrMarkdown, 1700000000);
      expect(decision).not.toBeNull();
      expect(decision?.title).toBe('ADR-002: Use FalkorDB Graph Engine');
      expect(decision?.status).toBe('accepted');
      expect(decision?.supersedes_id).toBe('ADR-001');
      expect(decision?.valid_from).toBe(1700000000);
      expect(decision?.valid_to).toBeNull();
      expect(decision?.source_kind).toBe('adr');
    });

    it('scans ADR directories recursively', async () => {
      const tempDir = path.join(os.tmpdir(), 'argon-test-adr-' + randomUUID());
      const adrDir = path.join(tempDir, 'docs', 'adr');
      await fs.promises.mkdir(adrDir, { recursive: true });

      await fs.promises.writeFile(
        path.join(adrDir, '001-init.md'),
        '# ADR-001: Initial Architecture\n\nStatus: accepted\n\nWe build Argon.'
      );

      const decisions = await scanAdrFiles(tempDir);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].title).toBe('ADR-001: Initial Architecture');

      await fs.promises.rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('temporal supersession management', () => {
    it('closes predecessor temporal validity window on supersession', () => {
      const dec1: MinedDecision = {
        id: 'dec_adr_001',
        title: 'ADR-001: Use Neo4j',
        status: 'accepted',
        valid_from: 1000,
        valid_to: null,
        source_url: 'docs/adr/001.md',
        source_kind: 'adr',
        summary: 'Use Neo4j',
        raw_text: '...',
      };

      const dec2: MinedDecision = {
        id: 'dec_adr_002',
        title: 'ADR-002: Use FalkorDB',
        status: 'accepted',
        valid_from: 2000,
        valid_to: null,
        source_url: 'docs/adr/002.md',
        source_kind: 'adr',
        summary: 'Use FalkorDB',
        raw_text: '...',
        supersedes_id: 'ADR-001',
      };

      const result = resolveSupersessions([dec1, dec2]);

      expect(result.supersedesLinks).toHaveLength(1);
      expect(result.supersedesLinks[0]).toEqual({
        source_id: 'dec_adr_002',
        target_id: 'dec_adr_001',
      });

      // dec1 window closed at dec2 start
      expect(dec1.valid_to).toBe(2000);
      expect(dec1.status).toBe('superseded');

      // dec2 active
      expect(dec2.valid_to).toBeNull();
      expect(dec2.status).toBe('accepted');
    });
  });

  describe('git revert mining', () => {
    it('pairs Revert commit messages with original commits', () => {
      const dummyAuthor = { id: 'auth1', name: 'Author', emailHash: 'auth1' };
      const commits: GitCommit[] = [
        {
          hash: 'aaa111222333',
          message: 'feat: experimental sync engine',
          summary: 'feat: experimental sync engine',
          author: dummyAuthor,
          timestamp: 1000,
          parents: [],
          files: [],
        },
        {
          hash: 'bbb444555666',
          message: 'Revert "feat: experimental sync engine"\n\nThis reverts commit aaa111222333.',
          summary: 'Revert "feat: experimental sync engine"',
          author: dummyAuthor,
          timestamp: 1200,
          parents: [],
          files: [],
        },
      ];

      const reverts = mineReverts(commits);
      expect(reverts).toHaveLength(1);
      expect(reverts[0].revert_commit_hash).toBe('bbb444555666');
      expect(reverts[0].reverted_commit_hash).toBe('aaa111222333');
    });
  });

  describe('commit decision mining', () => {
    it('extracts decisions from architectural commit messages', () => {
      const dummyAuthor = { id: 'auth1', name: 'Author', emailHash: 'auth1' };
      const commits: GitCommit[] = [
        {
          hash: '111111111111',
          message: 'chore: bump dependencies',
          summary: 'chore: bump dependencies',
          author: dummyAuthor,
          timestamp: 1000,
          parents: [],
          files: [],
        },
        {
          hash: '222222222222',
          message: 'feat: deprecate legacy RPC in favor of gRPC\n\nTransitioning to gRPC.',
          summary: 'feat: deprecate legacy RPC in favor of gRPC',
          author: dummyAuthor,
          timestamp: 1100,
          parents: [],
          files: [],
        },
      ];

      const decisions = mineCommitDecisions(commits);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].id).toBe('dec_commit_222222222222');
      expect(decisions[0].title).toBe('feat: deprecate legacy RPC in favor of gRPC');
      expect(decisions[0].status).toBe('superseded');
    });
  });

  describe('decision vectorization batching', () => {
    it('batches decisions and invokes embedder to produce 512-d embeddings', async () => {
      const decisions: MinedDecision[] = [
        {
          id: 'dec_1',
          title: 'Dec 1',
          status: 'accepted',
          valid_from: 1000,
          valid_to: null,
          source_url: 'url1',
          source_kind: 'adr',
          summary: 'Summary 1',
          raw_text: 'Text 1',
        },
        {
          id: 'dec_2',
          title: 'Dec 2',
          status: 'accepted',
          valid_from: 1000,
          valid_to: null,
          source_url: 'url2',
          source_kind: 'adr',
          summary: 'Summary 2',
          raw_text: 'Text 2',
        },
      ];

      const mockVector = new Array(512).fill(0.04419); // 512-d normalized mock
      const mockEmbedder = {
        embed: vi.fn().mockResolvedValue({ vector: mockVector, dim: 512 }),
      } as any;

      const embedded = await embedDecisions(decisions, mockEmbedder, 2);
      expect(embedded).toHaveLength(2);
      expect(embedded[0].embedding).toHaveLength(512);
      expect(embedded[1].embedding).toHaveLength(512);
      expect(mockEmbedder.embed).toHaveBeenCalledTimes(2);
    });
  });
});
