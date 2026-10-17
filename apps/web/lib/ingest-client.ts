/**
 * Browser-side client for repository ingestion. The ingest itself runs on the gateway
 * (clone → mine → write to FalkorDB); the UI starts a job and polls its status.
 */

export type IngestStatus = 'queued' | 'cloning' | 'mining' | 'indexing' | 'completed' | 'failed';

export interface IngestStatusResponse {
  workspaceId: string;
  status: IngestStatus;
  progress: number;
  error: string | null;
  repoUrl: string | null;
  jobId: string | null;
  nodeCount: number;
}

export interface StartedIngest {
  workspaceId: string;
  jobId?: string;
  repositoryFullName: string;
}

/** Index into the modal's four visual steps: CLONING, DERIVING, EMBEDDING, READY. */
export function stepIndexForStatus(status: IngestStatus): number {
  switch (status) {
    case 'queued':
    case 'cloning':
      return 0;
    case 'mining':
      return 1;
    case 'indexing':
      return 2;
    case 'completed':
      return 3;
    default:
      return 0;
  }
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body?.error || body?.message || `${fallback} (${res.status})`;
}

export async function startPublicIngest(
  repoUrl: string,
  token: string | null,
  signal?: AbortSignal
): Promise<StartedIngest> {
  const res = await fetch('/api/v1/workspaces/ingest-public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ repoUrl }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not start ingestion'));
  return (await res.json()) as StartedIngest;
}

export async function startPrivateIngest(
  repositoryFullName: string,
  installationId: number,
  token: string | null,
  signal?: AbortSignal
): Promise<StartedIngest> {
  const res = await fetch('/api/v1/workspaces/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ repositoryFullName, installationId }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not start ingestion'));
  return (await res.json()) as StartedIngest;
}

export async function fetchIngestStatus(
  workspaceId: string,
  token: string | null,
  signal?: AbortSignal
): Promise<IngestStatusResponse> {
  const res = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ingest-status`, {
    headers: authHeaders(token),
    signal,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not read ingestion status'));
  return (await res.json()) as IngestStatusResponse;
}

export interface WaitForIngestOptions {
  getToken: () => Promise<string | null>;
  onProgress?: (status: IngestStatusResponse) => void;
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  /** consecutive polling failures tolerated before giving up */
  maxPollErrors?: number;
}

/**
 * Polls until the job completes. Resolves with the final status; rejects with the job's error
 * message if it failed, or on timeout / abort / repeated polling errors.
 */
export async function waitForIngest(
  workspaceId: string,
  opts: WaitForIngestOptions
): Promise<IngestStatusResponse> {
  const interval = opts.intervalMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  const maxErrors = opts.maxPollErrors ?? 5;
  let errors = 0;

  while (true) {
    if (opts.signal?.aborted) throw new DOMException('Ingestion polling aborted', 'AbortError');
    if (Date.now() > deadline) throw new Error('Ingestion timed out. The repository may be too large.');

    try {
      const status = await fetchIngestStatus(workspaceId, await opts.getToken(), opts.signal);
      errors = 0;
      opts.onProgress?.(status);
      if (status.status === 'completed') return status;
      if (status.status === 'failed') {
        throw new IngestFailedError(status.error || 'Ingestion failed');
      }
    } catch (err) {
      if (err instanceof IngestFailedError) throw err;
      if ((err as Error)?.name === 'AbortError') throw err;
      if (++errors >= maxErrors) throw err;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, interval);
      opts.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Ingestion polling aborted', 'AbortError'));
        },
        { once: true }
      );
    });
  }
}

export class IngestFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestFailedError';
  }
}
