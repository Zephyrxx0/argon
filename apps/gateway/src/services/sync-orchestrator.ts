import crypto from 'node:crypto';
import type { ArgonGraphClient } from '@argon/graph';

export interface SyncJob {
  id: string;
  workspaceId: string;
  type: 'incremental_sync';
  event: string;
  deliveryId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export type SyncRunner = (
  jobId: string,
  event: string,
  payload: any,
  workspaceId: string,
) => Promise<void>;

export class SyncOrchestrator {
  private runner: SyncRunner | null = null;
  private jobs = new Map<string, SyncJob>();

  public registerRunner(runner: SyncRunner): void {
    this.runner = runner;
  }

  public async createIncrementalJob(
    graphClient: ArgonGraphClient | undefined,
    workspaceId: string,
    event: string,
    deliveryId: string,
  ): Promise<string> {
    const jobId = `sync_${crypto.randomUUID()}`;
    const createdAt = Date.now();

    const job: SyncJob = {
      id: jobId,
      workspaceId,
      type: 'incremental_sync',
      event,
      deliveryId,
      status: 'pending',
      createdAt,
    };
    this.jobs.set(jobId, job);

    if (graphClient) {
      try {
        await graphClient.query(
          `MERGE (j:IngestJob { id: $id })
           SET j.workspace_id = $workspaceId,
               j.type = 'incremental_sync',
               j.event = $event,
               j.delivery_id = $deliveryId,
               j.status = 'pending',
               j.created_at = $createdAt`,
          {
            id: jobId,
            workspaceId,
            event,
            deliveryId,
            createdAt,
          },
        );
      } catch (err) {
        console.error(`Failed to record IngestJob ${jobId} in FalkorDB:`, err);
      }
    }

    return jobId;
  }

  public dispatchSync(
    jobId: string,
    event: string,
    payload: any,
    workspaceId: string,
    graphClient?: ArgonGraphClient,
  ): void {
    // Fire and forget asynchronously
    setImmediate(async () => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'processing';
      }

      if (graphClient) {
        try {
          await graphClient.query(
            `MATCH (j:IngestJob { id: $id }) SET j.status = 'processing'`,
            { id: jobId },
          );
        } catch {
          // Ignore
        }
      }

      try {
        if (this.runner) {
          await this.runner(jobId, event, payload, workspaceId);
        }

        if (job) {
          job.status = 'completed';
          job.completedAt = Date.now();
        }

        if (graphClient) {
          await graphClient.query(
            `MATCH (j:IngestJob { id: $id }) SET j.status = 'completed', j.completed_at = $completedAt`,
            { id: jobId, completedAt: Date.now() },
          );
        }
      } catch (err: any) {
        const errorMsg = String(err?.message ?? err ?? 'Unknown sync failure');
        console.error(`Error executing sync job ${jobId}:`, err);

        if (job) {
          job.status = 'failed';
          job.error = errorMsg;
          job.completedAt = Date.now();
        }

        if (graphClient) {
          try {
            await graphClient.query(
              `MATCH (j:IngestJob { id: $id }) SET j.status = 'failed', j.error = $error, j.completed_at = $completedAt`,
              { id: jobId, error: errorMsg, completedAt: Date.now() },
            );
          } catch {
            // Ignore
          }
        }
      }
    });
  }

  public getJob(jobId: string): SyncJob | undefined {
    return this.jobs.get(jobId);
  }

  public clear(): void {
    this.jobs.clear();
  }
}

export const syncOrchestrator = new SyncOrchestrator();
