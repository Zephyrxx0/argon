import { randomUUID } from 'node:crypto';
import { ArgonGraphClient, initWorkspaceGraph } from '@argon/graph';
import { cloneRepository } from './git/clone.js';
import { extractCommits } from './git/log.js';
import { computeCoChangeCoupling } from './coupling/cochange.js';
import { scanAdrFiles, resolveSupersessions } from './mining/adr.js';
import { mineReverts } from './mining/reverts.js';
import { mineCommitDecisions } from './mining/commits.js';
import { embedDecisions } from './mining/embed.js';
import { FalkorIngestWriter } from './writer/falkordb.js';
import { redactSecrets } from './git/redact.js';

export interface IngestPipelineConfig {
  repoUrl: string;
  workspaceId: string;
  jobId?: string;
  depth?: number;
  maxCommits?: number;
  keepClone?: boolean;
  client?: ArgonGraphClient;
  installationToken?: string;
  userId?: string;
  userLogin?: string;
  userEmails?: string[];
}

export interface IngestSummary {
  workspaceId: string;
  jobId: string;
  repoUrl: string;
  commitCount: number;
  authorCount: number;
  fileCount: number;
  componentCount: number;
  decisionCount: number;
  revertCount: number;
  durationMs: number;
}

/**
 * Executes the complete ingestion pipeline for a repository into a FalkorDB workspace.
 */
export async function runIngestion(config: IngestPipelineConfig): Promise<IngestSummary> {
  const startTime = Date.now();
  const jobId = config.jobId || `job_${randomUUID().slice(0, 8)}`;
  const client = config.client || new ArgonGraphClient();
  if (!(await client.ping())) {
    await client.connect();
  }
  const writer = new FalkorIngestWriter(client, config.workspaceId);

  let cloneDir: string | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;

  try {
    // Stage 1: Initialize Workspace Schema
    await initWorkspaceGraph(client, config.workspaceId);

    // Stage 2: Queued State (0.0)
    await writer.updateJobStatus(jobId, config.repoUrl, 'queued', 0.0);

    // Stage 3: Cloning (0.15)
    await writer.updateJobStatus(jobId, config.repoUrl, 'cloning', 0.15);
    const cloneResult = await cloneRepository(config.repoUrl, {
      depth: config.depth,
      keepClone: config.keepClone,
      installationToken: config.installationToken,
    });
    cloneDir = cloneResult.dir;
    cleanupFn = cloneResult.cleanup;

    // Stage 4: Commit & Author Extraction
    const repoData = await extractCommits(cloneDir, {
      maxCommits: config.maxCommits,
    });

    // Stage 5: Co-Change Coupling & Components
    const coupling = computeCoChangeCoupling(repoData.commits);

    // Stage 6: Decision & Revert Mining (0.45)
    await writer.updateJobStatus(jobId, config.repoUrl, 'mining', 0.45);
    const adrDecisions = await scanAdrFiles(cloneDir);
    const commitDecisions = mineCommitDecisions(repoData.commits);
    const allRawDecisions = [...adrDecisions, ...commitDecisions];
    const { decisions, supersedesLinks } = resolveSupersessions(allRawDecisions);
    const reverts = mineReverts(repoData.commits);

    // Stage 7: Decision Indexing & Embedding (0.80)
    await writer.updateJobStatus(jobId, config.repoUrl, 'indexing', 0.80);
    await embedDecisions(decisions);

    // Stage 8: Graph Database Insertion via Parameterized UNWIND Batches
    // 8a. Persons
    const personRows = Array.from(repoData.authors.values()).map((a) => ({
      id: a.id,
      name: a.name,
    }));
    await writer.writePersons(personRows);

    // 8b. Files
    await writer.writeFiles(Array.from(repoData.files));

    // 8c. PullRequests (represented from commits)
    const prRows = repoData.commits.map((c) => ({
      id: `pr_${c.hash.slice(0, 12)}`,
      title: c.summary,
      merged_at: c.timestamp,
      is_revert: c.summary.toLowerCase().startsWith('revert'),
    }));
    await writer.writePullRequests(prRows);

    // 8d. Components
    const componentRows = coupling.components.map((c) => ({ name: c.name }));
    await writer.writeComponents(componentRows);

    // 8e. Decisions
    await writer.writeDecisions(decisions);

    // 8f. Relationships
    // (Person)-[:AUTHORED]->(PullRequest)
    const authoredEdges = repoData.commits.map((c) => ({
      author_id: c.author.id,
      pr_id: `pr_${c.hash.slice(0, 12)}`,
    }));
    await writer.writeAuthoredEdges(authoredEdges);

    // (PullRequest)-[:TOUCHES]->(File)
    const touchesEdges: { pr_id: string; file_path: string }[] = [];
    for (const c of repoData.commits) {
      const prId = `pr_${c.hash.slice(0, 12)}`;
      for (const f of c.files) {
        touchesEdges.push({ pr_id: prId, file_path: f.path });
      }
    }
    await writer.writeTouchesEdges(touchesEdges);

    // (File)-[:IN_COMPONENT]->(Component)
    const inComponentEdges: { file_path: string; component_name: string }[] = [];
    for (const comp of coupling.components) {
      for (const filePath of comp.files) {
        inComponentEdges.push({ file_path: filePath, component_name: comp.name });
      }
    }
    await writer.writeInComponentEdges(inComponentEdges);

    // (Component)-[:DEPENDS_ON]->(Component)
    await writer.writeDependsOnEdges(coupling.componentEdges);

    // (PullRequest)-[:REVERTS]->(PullRequest)
    const revertEdges = reverts.map((r) => ({
      revert_id: `pr_${r.revert_commit_hash.slice(0, 12)}`,
      reverted_id: `pr_${r.reverted_commit_hash.slice(0, 12)}`,
    }));
    await writer.writeRevertsEdges(revertEdges);

    // (Decision)-[:SUPERSEDES]->(Decision)
    await writer.writeSupersedesEdges(supersedesLinks);

    // (Decision)-[:GOVERNS]->(Component)
    // Map decisions to component if path/topic matches or default to root
    const governsEdges: { decision_id: string; component_name: string }[] = [];
    for (const d of decisions) {
      if (d.component_name) {
        governsEdges.push({ decision_id: d.id, component_name: d.component_name });
      } else {
        // Link to root or first component
        governsEdges.push({
          decision_id: d.id,
          component_name: coupling.components[0]?.name || 'root',
        });
      }
    }
    // Stage 8d: Identity Linking (:User)-[:IDENTIFIES]->(:Person) (TENANT-02, D-13, D-14, D-15)
    if (config.userId && config.userLogin) {
      await writer.linkUserToMinedPersons(
        config.userId,
        config.userLogin,
        config.userEmails || []
      );
    }

    // Stage 9: Completed State (1.0)
    await writer.updateJobStatus(jobId, config.repoUrl, 'completed', 1.0);

    return {
      workspaceId: config.workspaceId,
      jobId,
      repoUrl: config.repoUrl,
      commitCount: repoData.commits.length,
      authorCount: repoData.authors.size,
      fileCount: repoData.files.size,
      componentCount: coupling.components.length,
      decisionCount: decisions.length,
      revertCount: reverts.length,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    const rawError = error?.message || String(error);
    await writer.updateJobStatus(jobId, config.repoUrl, 'failed', 0.0, redactSecrets(rawError));
    throw error;
  } finally {
    if (cleanupFn) {
      await cleanupFn();
    }
  }
}
