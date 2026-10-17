import { randomUUID } from 'node:crypto';
import { ArgonGraphClient, initWorkspaceGraph } from '@argon/graph';
import { cloneRepository } from './git/clone.js';
import { extractCommits } from './git/log.js';
import { computeCoChangeCoupling } from './coupling/cochange.js';
import { scanAdrFiles, resolveSupersessions } from './mining/adr.js';
import { mineReverts } from './mining/reverts.js';
import { mineCommitDecisions } from './mining/commits.js';
import { embedDecisionsBestEffort } from './mining/embed.js';
import { FalkorIngestWriter } from './writer/falkordb.js';
import { redactSecrets } from './git/redact.js';
import { simpleGit } from 'simple-git';
import { resolveComponentForFile } from './coupling/components.js';
import { IdentityResolver } from './github/identity.js';
import { createDefaultGitHubApi } from './github/octokit-api.js';
import { parseGitHubRepo, type GitHubRepo } from './github/repo.js';
import type { GitHubApi } from './github/types.js';
import {
  ANONYMOUS_LIMITS,
  AUTHENTICATED_LIMITS,
  collectGitHubData,
  type GitHubGraphData,
  type GitHubLimits,
} from './github/enrich.js';
import { applyDecisionProvenance, commitNodeId, findFirstAddCommits } from './mining/provenance.js';
import { classifyOwner, computeComponentOwnership, readCodeOwners } from './mining/codeowners.js';

/** How often a running job proves it is alive (readers treat a few missed beats as "dead"). */
export const JOB_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Starts a heartbeat for a running job. Failures are ignored (a missed beat is harmless; the job
 * itself will surface real database errors). Returns a stop function.
 */
export function startJobHeartbeat(
  writer: Pick<FalkorIngestWriter, 'touchJob'>,
  jobId: string,
  intervalMs: number = JOB_HEARTBEAT_INTERVAL_MS
): () => void {
  const timer = setInterval(() => {
    writer.touchJob(jobId).catch(() => {});
  }, intervalMs);
  // never keep the process alive just for a heartbeat
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}

export interface IngestPipelineConfig {
  repoUrl: string;
  workspaceId: string;
  jobId?: string;
  depth?: number;
  maxCommits?: number;
  keepClone?: boolean;
  client?: ArgonGraphClient;
  /** OAuth/installation token for cloning private repos. */
  accessToken?: string;
  /** @deprecated use accessToken */
  installationToken?: string;
  userId?: string;
  userLogin?: string;
  userEmails?: string[];
  /**
   * GitHub pull requests / reviews / issues ("Company Brain"). Runs for github.com repositories
   * unless `false`; always best-effort (a failure here never fails the ingestion). Tests inject
   * `api`; `owner`/`repo` name the repository when `repoUrl` is not a github.com URL.
   */
  github?: false | GitHubEnrichmentConfig;
}

export interface GitHubEnrichmentConfig {
  api?: GitHubApi;
  owner?: string;
  repo?: string;
  /** Overrides the request caps (authenticated by default; reduced when there is no token). */
  limits?: Partial<GitHubLimits>;
  /** ISO timestamp: only read PRs / issues updated since then (re-sync). */
  since?: string;
}

/** What this run added to the graph, for re-sync notifications. Lists are capped. */
export interface IngestDelta {
  newCommitCount: number;
  newCommits: string[];
  newFiles: string[];
  newDecisions: string[];
  supersededDecisions: string[];
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
  pullRequestCount: number;
  reviewCount: number;
  issueCount: number;
  /** Component ownership edges from CODEOWNERS. */
  ownerCount: number;
  /** `skipped` = not a github.com repository (or disabled), `partial` = rate limited / some calls failed. */
  githubStatus: 'skipped' | 'completed' | 'partial';
  githubNotes: string[];
  delta: IngestDelta;
}

const DELTA_LIST_CAP = 200;


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
  let stopHeartbeat: (() => void) | undefined;

  try {
    // Stage 1: Initialize Workspace Schema
    await initWorkspaceGraph(client, config.workspaceId);

    // Stage 2: Queued State (0.0)
    await writer.updateJobStatus(jobId, config.repoUrl, 'queued', 0.0);
    stopHeartbeat = startJobHeartbeat(writer, jobId);

    // Stage 3: Cloning (0.15)
    await writer.updateJobStatus(jobId, config.repoUrl, 'cloning', 0.15);
    const cloneResult = await cloneRepository(config.repoUrl, {
      depth: config.depth,
      keepClone: config.keepClone,
      accessToken: config.accessToken ?? config.installationToken,
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
    const resolved = resolveSupersessions(allRawDecisions);
    let decisions = resolved.decisions;
    const supersedesLinks = resolved.supersedesLinks;
    const reverts = mineReverts(repoData.commits);

    // Stage 6b: GitHub pull requests, reviews, issues (best effort, read-only, no DB writes yet)
    const githubRepo = resolveGitHubRepo(config);
    const identity = new IdentityResolver(
      Array.from(repoData.authors.values()).map((a) => ({ id: a.id, name: a.name }))
    );
    const componentNames = new Set(coupling.components.map((c) => c.name));
    let github: GitHubGraphData | undefined;
    let githubStatus: IngestSummary['githubStatus'] = 'skipped';
    const githubNotes: string[] = [];

    if (githubRepo && config.github !== false && process.env.ARGON_GITHUB_ENRICH !== 'off') {
      try {
        const token = config.accessToken ?? config.installationToken;
        const api = config.github?.api ?? (await createDefaultGitHubApi(token));
        const limits: GitHubLimits = {
          ...(token || config.github?.api ? AUTHENTICATED_LIMITS : ANONYMOUS_LIMITS),
          ...config.github?.limits,
        };
        const localClone = cloneDir;
        github = await collectGitHubData({
          repo: githubRepo,
          api,
          commits: repoData.commits,
          identity,
          limits,
          since: config.github?.since,
          componentNames,
          lookupExistingPrIds: async (numbers) => {
            try {
              return await writer.readPullRequestIdsByNumber(numbers);
            } catch {
              return new Map();
            }
          },
          filesForCommit: (hash) => mergeCommitFiles(localClone, hash),
        });
        githubStatus = github.status;
        githubNotes.push(...github.notes);
      } catch (err: any) {
        githubStatus = 'partial';
        githubNotes.push(`GitHub stage failed: ${redactSecrets(err?.message ?? String(err)).slice(0, 200)}`);
      }
    }
    if (github && github.commentDecisions.length > 0) {
      decisions = [...decisions, ...github.commentDecisions];
    }

    // Provenance (offline): EXTRACTED_FROM edges and clickable source URLs. After supersession
    // resolution, which matches on the original source_url.
    const addCommits = adrDecisions.length > 0 ? await findFirstAddCommits(cloneDir, config.maxCommits ?? 1000) : undefined;
    const extractedFromEdges = applyDecisionProvenance({
      decisions,
      commits: repoData.commits,
      repo: parseGitHubRepo(config.repoUrl) ?? githubRepo,
      addCommits,
    });

    // CODEOWNERS (offline): owner of record per component
    const codeOwners = await readCodeOwners(cloneDir);
    const ownership = codeOwners ? computeComponentOwnership(codeOwners.rules, coupling.components) : [];
    const ownerRows = resolveOwnership(ownership, identity);

    // Stage 7: Decision Indexing & Embedding (0.80)
    await writer.updateJobStatus(jobId, config.repoUrl, 'indexing', 0.80);
    await embedDecisionsBestEffort(decisions);

    // What is new in this run (re-sync notifications). Read before anything is written.
    const delta = await computeDelta(writer, repoData.commits, decisions, Array.from(repoData.files));

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

    // (File)-[:CO_CHANGES]->(File)  (files must already exist: written in 8b)
    await writer.writeCoChangesEdges(coupling.fileEdges);

    // (PullRequest)-[:REVERTS]->(PullRequest)
    const revertEdges = reverts.map((r) => ({
      revert_id: `pr_${r.revert_commit_hash.slice(0, 12)}`,
      reverted_id: `pr_${r.reverted_commit_hash.slice(0, 12)}`,
    }));
    await writer.writeRevertsEdges(revertEdges);

    // (Decision)-[:SUPERSEDES]->(Decision)
    await writer.writeSupersedesEdges(supersedesLinks);

    // (Decision)-[:GOVERNS]->(Component)
    // A decision governs its explicit component; a commit-mined decision governs the components
    // that commit changed (top 3); anything else falls back to the first component (or 'root').
    const filesByCommit = new Map(repoData.commits.map((c) => [c.hash, c.files.map((f) => f.path)]));
    const governsEdges: { decision_id: string; component_name: string }[] = [];
    for (const d of decisions) {
      const touched = d.origin_commit
        ? topComponents(filesByCommit.get(d.origin_commit) ?? [], componentNames, 3)
        : [];
      const targets = d.component_name
        ? [d.component_name]
        : touched.length > 0
          ? touched
          : [coupling.components[0]?.name || 'root'];
      for (const component_name of targets) {
        governsEdges.push({ decision_id: d.id, component_name });
      }
    }
    await writer.writeGovernsEdges(governsEdges);

    // (Decision)-[:EXTRACTED_FROM]->(PullRequest): provenance for commit- and ADR-mined decisions.
    // Edges to GitHub placeholder PRs are written after those nodes exist (below).
    await writer.writeExtractedFromEdges(extractedFromEdges.filter((e) => !e.pr_id.startsWith('pr_gh_')));

    // Stage 8e: GitHub pull requests, reviews, issues + CODEOWNERS ownership (best effort)
    let reviewCount = 0;
    let issueCount = 0;
    let pullRequestCount = 0;
    try {
      await writer.writeGitHubPersons(identity.newPersons);
      await writer.setPersonLogins(identity.linkedPersons);
      if (github) {
        await writer.retirePlaceholderPullRequests(github.retirePlaceholderIds);
        await writer.updatePullRequests(github.mappedPullRequests);
        await writer.mergePlaceholderPullRequests(github.placeholderPullRequests);
        await writer.writeAuthoredEdges(github.authored);
        await writer.writeTouchesEdges(github.extraTouches);
        await writer.writeReviewedEdges(github.reviews);
        await writer.writeIssues(github.issues);
        await writer.writeClosesEdges(github.closes);
        await writer.deriveIssueAffects(github.issues.map((i) => i.id));
        await writer.writeExtractedFromEdges(extractedFromEdges.filter((e) => e.pr_id.startsWith('pr_gh_')));
        reviewCount = github.reviews.length;
        issueCount = github.issues.length;
        pullRequestCount = github.mappedPullRequests.length + github.placeholderPullRequests.length;
      }
      await writer.replaceComponentOwnership(ownerRows);
    } catch (err: any) {
      githubStatus = 'partial';
      githubNotes.push(`writing GitHub data failed: ${redactSecrets(err?.message ?? String(err)).slice(0, 200)}`);
    }
    if (githubRepo) {
      try {
        await writer.setJobGitHubStatus(jobId, githubStatus, githubNotes.join('; ') || null);
      } catch {
        // informational only
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
      pullRequestCount,
      reviewCount,
      issueCount,
      ownerCount: ownerRows.persons.length + ownerRows.teamEdges.length,
      githubStatus,
      githubNotes,
      delta,
    };
  } catch (error: any) {
    const rawError = error?.message || String(error);
    await writer.updateJobStatus(jobId, config.repoUrl, 'failed', 0.0, redactSecrets(rawError));
    throw error;
  } finally {
    stopHeartbeat?.();
    if (cleanupFn) {
      await cleanupFn();
    }
  }
}

/** The github.com repository this ingestion is about, from the URL or an explicit override. */
function resolveGitHubRepo(config: IngestPipelineConfig): GitHubRepo | null {
  const override = config.github && config.github.owner && config.github.repo ? config.github : null;
  if (override) {
    const owner = override.owner!;
    const repo = override.repo!;
    return { owner, repo, webUrl: `https://github.com/${owner}/${repo}` };
  }
  return parseGitHubRepo(config.repoUrl);
}

/** Files a merge commit brought in (git log lists none for merges): diff against its first parent. */
async function mergeCommitFiles(repoPath: string, hash: string): Promise<string[]> {
  try {
    const out = await simpleGit(repoPath).raw(['diff', '--name-only', `${hash}^1`, hash]);
    return out.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 500);
  } catch {
    return [];
  }
}

/** Turns CODEOWNERS ownership into graph rows, resolving `@login` owners to Person nodes. */
function resolveOwnership(
  ownership: ReturnType<typeof computeComponentOwnership>,
  identity: IdentityResolver
) {
  const persons: { owner_id: string; component_name: string; pattern: string; coverage: number }[] = [];
  const teamEdges: { owner_id: string; component_name: string; pattern: string; coverage: number }[] = [];
  const teams = new Map<string, { id: string; name: string }>();

  for (const o of ownership) {
    const owner = classifyOwner(o.owner);
    if (!owner) continue;
    const common = { component_name: o.component, pattern: o.pattern, coverage: o.coverage };
    if (owner.kind === 'team') {
      teams.set(owner.id, { id: owner.id, name: owner.name });
      teamEdges.push({ owner_id: owner.id, ...common });
    } else if (owner.kind === 'user') {
      persons.push({ owner_id: identity.resolve(owner.login), ...common });
    } else {
      // an email is only usable when it is a known git author (emails are never stored)
      const id = identity.resolveEmail(owner.email);
      if (id) persons.push({ owner_id: id, ...common });
    }
  }
  return { persons, teams: [...teams.values()], teamEdges };
}

async function computeDelta(
  writer: FalkorIngestWriter,
  commits: { hash: string; files: { path: string }[] }[],
  decisions: { id: string; status: string }[],
  files: string[]
): Promise<IngestDelta> {
  const empty: IngestDelta = {
    newCommitCount: commits.length,
    newCommits: commits.map((c) => commitNodeId(c.hash)).slice(0, DELTA_LIST_CAP),
    newFiles: files.slice(0, DELTA_LIST_CAP),
    newDecisions: decisions.map((d) => d.id).slice(0, DELTA_LIST_CAP),
    supersededDecisions: [],
  };
  try {
    const [prs, existingDecisions, existingFiles] = await Promise.all([
      writer.existingIds('pull_request', commits.map((c) => commitNodeId(c.hash))),
      writer.existingIds('decision', decisions.map((d) => d.id)),
      writer.existingIds('file', files),
    ]);
    const newCommits = commits.map((c) => commitNodeId(c.hash)).filter((id) => !prs.has(id));
    return {
      newCommitCount: newCommits.length,
      newCommits: newCommits.slice(0, DELTA_LIST_CAP),
      newFiles: files.filter((f) => !existingFiles.has(f)).slice(0, DELTA_LIST_CAP),
      newDecisions: decisions.filter((d) => !existingDecisions.has(d.id)).map((d) => d.id).slice(0, DELTA_LIST_CAP),
      supersededDecisions: decisions
        .filter((d) => d.status === 'superseded' && existingDecisions.has(d.id) && existingDecisions.get(d.id) !== 'superseded')
        .map((d) => d.id)
        .slice(0, DELTA_LIST_CAP),
    };
  } catch {
    return empty;
  }
}

/** The components (that exist in the graph) most touched by a set of files, most files first. */
function topComponents(files: string[], known: Set<string>, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const component = resolveComponentForFile(file);
    if (known.has(component)) counts.set(component, (counts.get(component) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}
