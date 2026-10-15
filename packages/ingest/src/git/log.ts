import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseMailmap, resolveAuthor } from './author.js';
import type {
  ExtractedRepoData,
  GitCommit,
  GitFileChange,
  LogOptions,
  ResolvedAuthor,
} from './types.js';

/**
 * Extracts commit history, touched files, and deduplicated authors from a git repository.
 */
export async function extractCommits(
  repoPath: string,
  options: LogOptions = {}
): Promise<ExtractedRepoData> {
  const maxCommits = options.maxCommits ?? 1000;
  const git: SimpleGit = simpleGit(repoPath);

  let mailmap;
  const mailmapFile = path.join(repoPath, '.mailmap');
  try {
    if (fs.existsSync(mailmapFile)) {
      const content = await fs.promises.readFile(mailmapFile, 'utf8');
      mailmap = parseMailmap(content);
    }
  } catch {
    // Non-fatal
  }

  const logArgs: string[] = [
    `--max-count=${maxCommits}`,
    '--name-status',
  ];

  if (options.since) {
    logArgs.push(`--since=${options.since}`);
  }

  const logResult = await git.log(logArgs);

  const authors = new Map<string, ResolvedAuthor>();
  const allFiles = new Set<string>();
  const commits: GitCommit[] = [];

  for (const entry of logResult.all) {
    const author = resolveAuthor(entry.author_name, entry.author_email, mailmap);
    if (!authors.has(author.id)) {
      authors.set(author.id, author);
    }

    const dateEpochSeconds = Math.floor(new Date(entry.date).getTime() / 1000);

    const files: GitFileChange[] = [];
    if ('diff' in entry && (entry as any).diff?.files) {
      for (const f of (entry as any).diff.files) {
        const filePath = f.file || '';
        if (filePath) {
          allFiles.add(filePath);
          files.push({
            path: filePath,
            status: f.changes > 0 ? 'M' : 'A',
          });
        }
      }
    }

    commits.push({
      hash: entry.hash,
      message: entry.message,
      summary: entry.message.split('\n')[0].trim(),
      author,
      timestamp: dateEpochSeconds,
      parents: [],
      files,
    });
  }

  try {
    const diffTreeRaw = await git.raw([
      'log',
      `--max-count=${maxCommits}`,
      '--pretty=format:COMMIT_HASH:%H',
      '--name-status',
    ]);

    const commitBlocks = diffTreeRaw.split('COMMIT_HASH:').filter(Boolean);
    const commitFileMap = new Map<string, GitFileChange[]>();

    for (const block of commitBlocks) {
      const lines = block.trim().split('\n');
      const hash = lines[0].trim();
      const changes: GitFileChange[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const statusChar = parts[0][0] as GitFileChange['status'];
          const filePath = parts[parts.length - 1];
          changes.push({
            path: filePath,
            status: statusChar || 'M',
          });
          allFiles.add(filePath);
        }
      }
      commitFileMap.set(hash, changes);
    }

    for (const commit of commits) {
      if (commitFileMap.has(commit.hash)) {
        commit.files = commitFileMap.get(commit.hash)!;
      }
    }
  } catch {
    // Keep existing files if raw log fails
  }

  return {
    repoPath,
    commits,
    authors,
    files: allFiles,
  };
}
