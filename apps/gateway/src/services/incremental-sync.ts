import type { ArgonGraphClient } from '@argon/graph';
import {
  executeIncrementalSyncCommits,
  executeRollingCouplingUpdate,
  executeAdvanceAdrSuperseded,
  executeUpsertDecision,
  ArgonEmbedder,
} from '@argon/graph';
import { parseAdrDocument } from '@argon/ingest';
import { GitHubAppService } from './github-app.js';

export interface IncrementalSyncResult {
  workspaceId: string;
  trigger: 'push' | 'pull_request';
  updated: {
    commits: string[];
    files: string[];
    decisions: string[];
  };
  superseded: string[];
}

export function detectRevertedSha(message: string): string | undefined {
  if (!message) return undefined;
  // Match "This reverts commit <sha>"
  const hashMatch = message.match(/This reverts commit ([a-f0-9]{7,40})/i);
  if (hashMatch) {
    return hashMatch[1];
  }
  return undefined;
}

export function isAdrPath(filePath: string): boolean {
  if (!filePath) return false;
  const p = filePath.toLowerCase();
  return (
    p.startsWith('docs/adr/') ||
    p.startsWith('docs/decisions/') ||
    p.startsWith('decisions/') ||
    p.endsWith('.adr.md')
  );
}

export function extractExplicitFiles(content: string): string[] {
  if (!content) return [];
  // Extract relative file path candidates: e.g. apps/web/app/page.tsx, packages/graph/src/index.ts
  const matches = content.match(/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

import { EventBroadcaster, eventBroadcaster } from './event-broadcaster.js';

export interface IncrementalSyncServiceOptions {
  graphClient?: ArgonGraphClient;
  githubAppService?: GitHubAppService;
  embedder?: ArgonEmbedder;
  broadcaster?: EventBroadcaster;
}

export class IncrementalSyncService {
  private graphClient?: ArgonGraphClient;
  private githubAppService: GitHubAppService;
  private embedder: ArgonEmbedder;
  private broadcaster: EventBroadcaster;

  constructor(options?: IncrementalSyncServiceOptions) {
    this.graphClient = options?.graphClient;
    this.githubAppService = options?.githubAppService ?? new GitHubAppService();
    this.embedder = options?.embedder ?? new ArgonEmbedder({ provider: 'local' });
    this.broadcaster = options?.broadcaster ?? eventBroadcaster;
  }

  public async processPushSync(
    payload: any,
    workspaceId: string,
  ): Promise<IncrementalSyncResult> {
    const rawCommits = Array.isArray(payload.commits) ? payload.commits : [];
    const formattedCommits = rawCommits.map((c: any) => ({
      sha: String(c.id || c.sha || ''),
      message: String(c.message || ''),
      authorEmail: String(c.author?.email || 'unknown@example.local'),
      authorName: String(c.author?.name || 'Unknown Author'),
      timestamp: c.timestamp ? new Date(c.timestamp).getTime() : Date.now(),
      added: Array.isArray(c.added) ? c.added : [],
      modified: Array.isArray(c.modified) ? c.modified : [],
      removed: Array.isArray(c.removed) ? c.removed : [],
      revertsSha: detectRevertedSha(c.message),
    }));

    const touchedFilesSet = new Set<string>();
    const couplingPairs: { fileA: string; fileB: string }[] = [];

    for (const c of formattedCommits) {
      c.added.forEach((f: string) => touchedFilesSet.add(f));
      c.modified.forEach((f: string) => touchedFilesSet.add(f));
      c.removed.forEach((f: string) => touchedFilesSet.add(f));

      const activeFiles = [...c.added, ...c.modified];
      // Churn threshold: only calculate co-change if commit touches <= 50 files
      if (activeFiles.length > 1 && activeFiles.length <= 50) {
        for (let i = 0; i < activeFiles.length; i++) {
          for (let j = i + 1; j < activeFiles.length; j++) {
            couplingPairs.push({ fileA: activeFiles[i], fileB: activeFiles[j] });
          }
        }
      }
    }

    if (this.graphClient && formattedCommits.length > 0) {
      await executeIncrementalSyncCommits(this.graphClient, {
        workspaceId,
        commits: formattedCommits,
      });

      if (couplingPairs.length > 0) {
        await executeRollingCouplingUpdate(this.graphClient, {
          workspaceId,
          pairs: couplingPairs,
        });
      }
    }

    return {
      workspaceId,
      trigger: 'push',
      updated: {
        commits: formattedCommits.map((c: any) => c.sha).filter(Boolean),
        files: Array.from(touchedFilesSet),
        decisions: [],
      },
      superseded: [],
    };
  }

  public async processPullRequestSync(
    payload: any,
    workspaceId: string,
  ): Promise<IncrementalSyncResult> {
    const owner =
      payload.repository?.owner?.login ||
      payload.repository?.owner?.name ||
      payload.repository?.full_name?.split('/')[0] ||
      '';
    const repo = payload.repository?.name || payload.repository?.full_name?.split('/')[1] || '';
    const pullNumber = payload.pull_request?.number;
    const mergedAt = payload.pull_request?.merged_at || new Date().toISOString();
    const mergeCommitSha = String(
      payload.pull_request?.merge_commit_sha || payload.pull_request?.head?.sha || '',
    );
    const installationId = payload.installation?.id;

    const updatedDecisionIds: string[] = [];
    const supersededDecisionIds: string[] = [];
    let changedFiles: string[] = [];

    // Query PR files via Octokit if installation token is available
    if (installationId && owner && repo && pullNumber) {
      try {
        const octokit = await this.githubAppService.getInstallationOctokit(installationId);
        const filesResponse = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber,
        });

        changedFiles = filesResponse.data.map((f: any) => f.filename);
        const adrFiles = changedFiles.filter((p: string) => isAdrPath(p));

        for (const adrPath of adrFiles) {
          try {
            const contentRes = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: adrPath,
              ref: mergeCommitSha || undefined,
            });

            let markdownContent = '';
            if ('content' in contentRes.data && contentRes.data.content) {
              markdownContent = Buffer.from(contentRes.data.content, 'base64').toString('utf-8');
            }

            const parsed = parseAdrDocument(
              adrPath,
              markdownContent,
              Date.parse(mergedAt) || Date.now(),
            );

            if (parsed) {
              const explicitFiles = extractExplicitFiles(markdownContent);
              const governedFiles =
                explicitFiles.length > 0
                  ? explicitFiles
                  : changedFiles.filter((f) => !isAdrPath(f));

              // Compute 512-d CPU vector embedding
              const embedRes = await this.embedder.embed(
                parsed.raw_text || `${parsed.title}\n${parsed.summary}`,
                false,
                parsed.title,
              );

              if (this.graphClient) {
                await executeUpsertDecision(this.graphClient, {
                  workspaceId,
                  id: parsed.id,
                  title: parsed.title,
                  problem: parsed.summary,
                  decision: parsed.raw_text,
                  status: parsed.status,
                  validFrom: mergedAt,
                  validTo: null,
                  embedding: embedRes.vector,
                  files: governedFiles,
                });

                if (parsed.supersedes_id) {
                  await executeAdvanceAdrSuperseded(this.graphClient, {
                    workspaceId,
                    oldDecisionId: parsed.supersedes_id,
                    newDecisionId: parsed.id,
                    mergedAt,
                  });
                  supersededDecisionIds.push(parsed.supersedes_id);
                }
              }

              updatedDecisionIds.push(parsed.id);
            }
          } catch (fileErr) {
            console.error(`Failed to fetch or parse ADR ${adrPath}:`, fileErr);
          }
        }
      } catch (prErr) {
        console.error(`Failed to list files for PR #${pullNumber}:`, prErr);
      }
    }

    return {
      workspaceId,
      trigger: 'pull_request',
      updated: {
        commits: mergeCommitSha ? [mergeCommitSha] : [],
        files: changedFiles,
        decisions: updatedDecisionIds,
      },
      superseded: supersededDecisionIds,
    };
  }

  public async sync(
    _jobId: string,
    event: string,
    payload: any,
    workspaceId: string,
  ): Promise<IncrementalSyncResult> {
    let result: IncrementalSyncResult;
    if (event === 'push') {
      result = await this.processPushSync(payload, workspaceId);
    } else if (event === 'pull_request') {
      result = await this.processPullRequestSync(payload, workspaceId);
    } else {
      result = {
        workspaceId,
        trigger: 'push',
        updated: { commits: [], files: [], decisions: [] },
        superseded: [],
      };
    }

    // Broadcast live event delta to subscribed SSE clients
    this.broadcaster.broadcast(workspaceId, 'sync:complete', result);

    return result;
  }
}
