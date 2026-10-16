import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { CloneOptions, CloneResult } from './types.js';
import { sanitizeError, createSanitizedAuthError } from './redact.js';

/**
 * Clean up a cloned repository directory unless debug retention is requested.
 */
export async function cleanupClone(targetDir: string, force = false): Promise<void> {
  const keepClone = process.env.KEEP_CLONE === 'true' || process.env.KEEP_CLONE === '1';
  if (keepClone && !force) {
    return;
  }
  try {
    await fs.promises.rm(targetDir, { recursive: true, force: true });
  } catch (error) {
    // Non-fatal cleanup error
    console.warn(`[ingest:clone] Failed to clean up temp directory ${targetDir}:`, sanitizeError(error).message);
  }
}

/**
 * Clones a repository with blobless filtering into an ephemeral temporary directory.
 */
export async function cloneRepository(repoUrl: string, options: CloneOptions = {}): Promise<CloneResult> {
  const blobless = options.blobless !== false; // default true
  const keepClone = options.keepClone ?? (process.env.KEEP_CLONE === 'true');
  const targetDir = options.targetDir || path.join(os.tmpdir(), 'argon-clones', randomUUID());

  await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });

  const cloneArgs: string[] = [];
  if (blobless) {
    cloneArgs.push('--filter=blob:none');
  }
  if (options.depth) {
    cloneArgs.push(`--depth=${options.depth}`);
  }
  if (options.branch) {
    cloneArgs.push(`--branch=${options.branch}`);
  }

  if (options.installationToken) {
    const creds = Buffer.from(`x-access-token:${options.installationToken}`).toString('base64');
    cloneArgs.unshift('-c', `http.extraheader=Authorization: Basic ${creds}`);
  }

  // Handle local path urls (file:// or raw directory)
  const normalizedUrl = repoUrl.startsWith('file://') ? repoUrl.slice(7) : repoUrl;

  const git: SimpleGit = simpleGit().env('GIT_TERMINAL_PROMPT', '0');
  try {
    await git.clone(normalizedUrl, targetDir, cloneArgs);
  } catch (error: any) {
    const errorMsg = String(error?.message || error);
    if (
      errorMsg.includes('Authentication failed') ||
      errorMsg.includes('HTTP 401') ||
      errorMsg.includes('HTTP 403') ||
      errorMsg.includes('Bad credentials')
    ) {
      throw createSanitizedAuthError(error);
    }
    throw sanitizeError(error);
  }

  const cleanup = async () => {
    if (!keepClone) {
      await cleanupClone(targetDir);
    }
  };

  return {
    dir: targetDir,
    cleanup,
  };
}
