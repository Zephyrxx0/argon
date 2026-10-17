import { createHash } from 'node:crypto';

export type ParsedRepoUrl =
  | { ok: true; owner: string; repo: string; url: string; fullName: string }
  | { ok: false; error: string };

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * Server-side validation for public-repository ingestion. The browser also validates, but this
 * is the real gate (SSRF / local-file / credential-smuggling defence): only plain
 * `https://github.com/<owner>/<repo>[.git]` URLs are accepted and the clone URL is rebuilt from
 * the parsed parts, never taken verbatim from the client.
 */
export function parsePublicRepoUrl(raw: unknown): ParsedRepoUrl {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'repoUrl is required' };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Malformed repository URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only https:// repository URLs are permitted' };
  }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    return { ok: false, error: 'Repository URL must not contain credentials, a port, a query or a fragment' };
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    return { ok: false, error: 'Only public github.com repositories can be ingested from a URL' };
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) {
    return { ok: false, error: 'URL must be of the form https://github.com/<owner>/<repo>' };
  }
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, '');
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || repo === '.' || repo === '..' || owner === '.' || owner === '..') {
    return { ok: false, error: 'Invalid owner or repository name' };
  }

  return {
    ok: true,
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    fullName: `${owner}/${repo}`,
  };
}

/**
 * Deterministic workspace id per (user, repo): re-ingesting the same repo updates the same
 * graph, while two users never share (or collide on) a workspace. Matches /^[a-zA-Z0-9_-]+$/.
 */
export function publicWorkspaceId(userId: string, owner: string, repo: string): string {
  const slug = `${owner}-${repo}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = createHash('sha256').update(userId).digest('hex').slice(0, 6);
  return `pub-${slug || 'repo'}-${suffix}`;
}

/** Caps concurrent clone/mining jobs: globally, and one at a time per user. */
export class IngestLimiter {
  private readonly activeByUser = new Set<string>();

  constructor(private readonly maxGlobal = 3) {}

  get active(): number {
    return this.activeByUser.size;
  }

  /** Returns a release function, or a reason string when the request must be rejected. */
  tryAcquire(userId: string): { release: () => void } | { reason: 'user' | 'global' } {
    if (this.activeByUser.has(userId)) return { reason: 'user' };
    if (this.activeByUser.size >= this.maxGlobal) return { reason: 'global' };
    this.activeByUser.add(userId);
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          this.activeByUser.delete(userId);
        }
      },
    };
  }
}

/** A running job beats every 15s; this many seconds of silence means the process behind it is gone. */
export const JOB_STALE_AFTER_SECONDS = 90;

const TERMINAL = new Set(['completed', 'failed']);

export interface JobRow {
  status?: unknown;
  progress?: unknown;
  error?: unknown;
  updatedAt?: unknown;
}

export interface EffectiveJob {
  status: string;
  progress: number;
  error: string | null;
}

/**
 * What the UI should believe about a job. A job that never reached completed/failed but has gone
 * quiet (gateway killed or restarted mid-ingest) would otherwise read "indexing" forever, so it is
 * reported as failed.
 */
export function effectiveJob(row: JobRow | null | undefined, nowSeconds: number): EffectiveJob {
  if (!row) return { status: 'queued', progress: 0, error: null };

  const status = typeof row.status === 'string' && row.status ? row.status : 'queued';
  const progress = Number(row.progress ?? 0) || 0;
  const error = typeof row.error === 'string' && row.error ? row.error : null;
  const updatedAt = Number(row.updatedAt ?? 0);

  if (!TERMINAL.has(status) && updatedAt > 0) {
    const silent = Math.floor(nowSeconds - updatedAt);
    if (silent > JOB_STALE_AFTER_SECONDS) {
      return {
        status: 'failed',
        progress,
        error: `Ingestion stopped unexpectedly (no activity for ${silent}s); the server may have restarted. Start it again.`,
      };
    }
  }
  return { status, progress, error };
}
