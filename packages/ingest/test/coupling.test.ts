import { describe, it, expect } from 'vitest';
import {
  isArchitecturalFile,
  resolveComponentForFile,
  deriveComponents,
  computeCoChangeCoupling,
  type GitCommit,
} from '../src/index.js';

describe('co-change coupling & component boundaries', () => {
  describe('file filtering', () => {
    it('excludes lockfiles, minified files, and binary assets', () => {
      expect(isArchitecturalFile('pnpm-lock.yaml')).toBe(false);
      expect(isArchitecturalFile('package-lock.json')).toBe(false);
      expect(isArchitecturalFile('cargo.lock')).toBe(false);
      expect(isArchitecturalFile('dist/bundle.min.js')).toBe(false);
      expect(isArchitecturalFile('assets/logo.png')).toBe(false);
      expect(isArchitecturalFile('node_modules/pkg/index.js')).toBe(false);

      expect(isArchitecturalFile('packages/graph/src/client.ts')).toBe(true);
      expect(isArchitecturalFile('apps/web/app/page.tsx')).toBe(true);
      expect(isArchitecturalFile('docs/adr/001-init.md')).toBe(true);
    });
  });

  describe('component resolution', () => {
    it('maps monorepo directories to component names', () => {
      expect(resolveComponentForFile('packages/graph/src/client.ts')).toBe('packages/graph');
      expect(resolveComponentForFile('apps/web/app/page.tsx')).toBe('apps/web');
      expect(resolveComponentForFile('services/worker/index.ts')).toBe('services/worker');
      expect(resolveComponentForFile('README.md')).toBe('root');
      expect(resolveComponentForFile('package.json')).toBe('root');
    });

    it('derives sorted component definitions', () => {
      const files = [
        'packages/graph/src/client.ts',
        'packages/graph/src/index.ts',
        'apps/web/app/page.tsx',
        'pnpm-lock.yaml', // should be excluded
        'package.json',
      ];
      const components = deriveComponents(files);
      expect(components).toHaveLength(3);
      expect(components.map((c) => c.name)).toEqual(['apps/web', 'packages/graph', 'root']);
    });
  });

  describe('co-change computation', () => {
    it('filters mass commits and computes Jaccard similarity', () => {
      const dummyAuthor = { id: 'abc', name: 'Author', emailHash: 'abc' };

      // Commit touching 35 files (mass refactor) -> should be skipped
      const massFiles = Array.from({ length: 35 }, (_, i) => ({
        path: `packages/core/file_${i}.ts`,
        status: 'M' as const,
      }));

      const commits: GitCommit[] = [
        {
          hash: 'c1',
          message: 'mass refactor',
          summary: 'mass refactor',
          author: dummyAuthor,
          timestamp: 1000,
          parents: [],
          files: massFiles,
        },
        // 4 commits co-changing packages/graph/client.ts and packages/utils/helper.ts
        ...Array.from({ length: 4 }, (_, i) => ({
          hash: `commit_${i}`,
          message: `feat: change ${i}`,
          summary: `feat: change ${i}`,
          author: dummyAuthor,
          timestamp: 1000 + i * 10,
          parents: [],
          files: [
            { path: 'packages/graph/src/client.ts', status: 'M' as const },
            { path: 'packages/utils/src/helper.ts', status: 'M' as const },
          ],
        })),
        // 1 independent commit touching only packages/graph/src/client.ts
        {
          hash: 'c_extra',
          message: 'fix: graph client',
          summary: 'fix: graph client',
          author: dummyAuthor,
          timestamp: 1100,
          parents: [],
          files: [{ path: 'packages/graph/src/client.ts', status: 'M' as const }],
        },
      ];

      const result = computeCoChangeCoupling(commits, {
        minCoCommits: 3,
        minJaccard: 0.15,
        maxFilesPerCommit: 30,
      });

      // Assert component edges
      expect(result.componentEdges).toHaveLength(1);
      const edge = result.componentEdges[0];
      expect(edge.count).toBe(4);
      // countA = 5, countB = 4, shared = 4 -> Jaccard = 4 / (5 + 4 - 4) = 4/5 = 0.8
      expect(edge.weight).toBe(0.8);
      expect([edge.source, edge.target].sort()).toEqual(['packages/graph', 'packages/utils']);

      // Assert file edges
      expect(result.fileEdges).toHaveLength(1);
      expect(result.fileEdges[0].count).toBe(4);
      expect(result.fileEdges[0].weight).toBe(0.8);
    });

    it('filters out pairs below threshold', () => {
      const dummyAuthor = { id: 'abc', name: 'Author', emailHash: 'abc' };
      const commits: GitCommit[] = [
        {
          hash: 'c1',
          message: 'one off commit',
          summary: 'one off commit',
          author: dummyAuthor,
          timestamp: 1000,
          parents: [],
          files: [
            { path: 'packages/graph/src/client.ts', status: 'M' as const },
            { path: 'packages/utils/src/helper.ts', status: 'M' as const },
          ],
        },
      ];

      const result = computeCoChangeCoupling(commits, { minCoCommits: 3 });
      expect(result.componentEdges).toHaveLength(0);
      expect(result.fileEdges).toHaveLength(0);
    });
  });
});
