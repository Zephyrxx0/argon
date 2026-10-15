import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { simpleGit, SimpleGit } from 'simple-git';
import {
  hashAuthorEmail,
  parseMailmap,
  resolveAuthor,
  extractCommits,
  cloneRepository,
} from '../src/index.js';

describe('git extraction module', () => {
  let testRepoDir: string;
  let git: SimpleGit;

  beforeEach(async () => {
    testRepoDir = path.join(os.tmpdir(), 'argon-test-git-' + randomUUID());
    await fs.promises.mkdir(testRepoDir, { recursive: true });
    git = simpleGit(testRepoDir);
    await git.init();
    await git.addConfig('user.name', 'Test Author');
    await git.addConfig('user.email', 'author@example.com');
  });

  afterEach(async () => {
    await fs.promises.rm(testRepoDir, { recursive: true, force: true });
  });

  describe('author mapping & mailmap', () => {
    it('hashes emails consistently with sha256', () => {
      const hash1 = hashAuthorEmail('User@Example.com ');
      const hash2 = hashAuthorEmail('user@example.com');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('parses .mailmap mappings and resolves canonical authors', () => {
      const mailmapContent = `
Proper Contributor <canonical@corp.com> Old Alias <alias@corp.com>
Only Name <canonical@corp.com>
`;
      const mailmap = parseMailmap(mailmapContent);
      expect(mailmap.has('alias@corp.com')).toBe(true);
      expect(mailmap.get('alias@corp.com')?.name).toBe('Proper Contributor');
      expect(mailmap.get('alias@corp.com')?.email).toBe('canonical@corp.com');

      const resolved = resolveAuthor('Old Alias', 'alias@corp.com', mailmap);
      expect(resolved.name).toBe('Proper Contributor');
      expect(resolved.id).toBe(hashAuthorEmail('canonical@corp.com'));
      expect((resolved as any).email).toBeUndefined(); // Raw email never exposed
    });
  });

  describe('commit extraction', () => {
    it('extracts commits, timestamps, and touched files', async () => {
      // Create .mailmap
      await fs.promises.writeFile(
        path.join(testRepoDir, '.mailmap'),
        'Jane Doe <jane@canonical.org> Test Author <author@example.com>\n'
      );

      // Commit 1
      const file1 = path.join(testRepoDir, 'packages/core/src/index.ts');
      await fs.promises.mkdir(path.dirname(file1), { recursive: true });
      await fs.promises.writeFile(file1, 'console.log("hello");');
      await git.add(['.mailmap', 'packages/core/src/index.ts']);
      await git.commit('feat: initialize core package');

      // Commit 2
      const file2 = path.join(testRepoDir, 'packages/utils/src/math.ts');
      await fs.promises.mkdir(path.dirname(file2), { recursive: true });
      await fs.promises.writeFile(file2, 'export const add = (a, b) => a + b;');
      await git.add('packages/utils/src/math.ts');
      await git.commit('feat: add math utilities');

      const data = await extractCommits(testRepoDir);

      expect(data.commits).toHaveLength(2);
      expect(data.files.has('packages/core/src/index.ts')).toBe(true);
      expect(data.files.has('packages/utils/src/math.ts')).toBe(true);

      // Author resolution via .mailmap
      const firstCommit = data.commits[0];
      expect(firstCommit.author.name).toBe('Jane Doe');
      expect(firstCommit.author.id).toBe(hashAuthorEmail('jane@canonical.org'));
      expect(firstCommit.timestamp).toBeGreaterThan(0);
      expect(firstCommit.files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cloning & cleanup', () => {
    it('clones locally and handles cleanup', async () => {
      const f = path.join(testRepoDir, 'README.md');
      await fs.promises.writeFile(f, '# Argon Test');
      await git.add('README.md');
      await git.commit('chore: init');

      const cloneResult = await cloneRepository(`file://${testRepoDir}`, { blobless: false });
      expect(fs.existsSync(path.join(cloneResult.dir, 'README.md'))).toBe(true);

      await cloneResult.cleanup();
      expect(fs.existsSync(cloneResult.dir)).toBe(false);
    });
  });
});
