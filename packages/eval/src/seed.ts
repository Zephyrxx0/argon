import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonGraphClient, initWorkspaceGraph } from '@argon/graph';
import { writeChatThreads, type ChatThreadFile } from '@argon/ingest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SeedDecision {
  id: string;
  title: string;
  status: string;
  valid_from: number;
  valid_to?: number | null;
  summary: string;
  source_url?: string;
  component: string;
  supersedes?: string | null;
  /** Id of the pull request this decision was extracted from -> (Decision)-[:EXTRACTED_FROM]->(PullRequest). */
  extracted_from?: string | null;
  embedding: number[];
}

export interface SeedRevert {
  revertId: string;
  revertedId: string;
  summary: string;
  timestamp: number;
  files: string[];
}

export interface SeedPerson {
  id: string;
  name: string;
}

export interface SeedAuthored {
  author_id: string;
  pr_id: string;
}

export interface SeedDependsOn {
  source: string;
  target: string;
  weight: number;
  count: number;
}

/** Metadata (and touched files) for a pull request node; created when it does not exist yet. */
export interface SeedPullRequest {
  id: string;
  number?: number;
  title?: string;
  url?: string;
  state?: string;
  merged_at?: number;
  files?: string[];
}

export interface SeedReviewed {
  reviewer_id: string;
  pr_id: string;
  state?: string;
  count?: number;
}

export interface SeedIssue {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  url?: string;
  created_at: number;
  /** Pull request ids that close the issue -> (PullRequest)-[:CLOSES]->(Issue). */
  closed_by?: string[];
}

/** Owner of record from CODEOWNERS -> (Person|Team)-[:OWNS]->(Component). */
export interface SeedOwner {
  owner_id: string;
  kind: 'person' | 'team';
  name?: string;
  component: string;
  pattern: string;
  coverage?: number;
}

export interface SeedData {
  workspaceId: string;
  components: Array<{ name: string }>;
  files: Array<{ path: string; component: string }>;
  decisions: SeedDecision[];
  reverts: SeedRevert[];
  persons?: SeedPerson[];
  authored?: SeedAuthored[];
  dependsOn?: SeedDependsOn[];
  pullRequests?: SeedPullRequest[];
  reviewed?: SeedReviewed[];
  issues?: SeedIssue[];
  owners?: SeedOwner[];
  /**
   * Invented chat threads that ended in a decision (5.3). Must declare `"synthetic": true`; written
   * through the same reader the ingest package exposes, as `Decision {source_kind: 'chat'}`.
   */
  chat?: ChatThreadFile;
}

/**
 * Execute parameterized Cypher query with chunked UNWIND batches.
 * Conforms to T-05-07 (no string interpolation into Cypher queries).
 */
async function runBatched<T>(
  client: ArgonGraphClient,
  workspaceId: string,
  query: string,
  items: T[],
  batchSize = 250
): Promise<void> {
  if (!items || items.length === 0) return;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await client.query(workspaceId, query, { batch });
  }
}

/**
 * Seed a single workspace from a pre-computed JSON seed file.
 * Resets existing nodes and initializes schema per D-10, T-05-07, T-05-08, T-05-09.
 */
export async function seedWorkspace(
  client: ArgonGraphClient,
  seedDataPath: string
): Promise<{ workspaceId: string; nodeCount: number }> {
  if (!fs.existsSync(seedDataPath)) {
    throw new Error(`Seed data file not found: ${seedDataPath}`);
  }

  const raw = fs.readFileSync(seedDataPath, 'utf-8');
  const data: SeedData = JSON.parse(raw);
  const workspaceId = data.workspaceId;

  if (!workspaceId) {
    throw new Error(`Invalid seed file: missing workspaceId in ${seedDataPath}`);
  }

  // T-05-08: Validate 512-dimension vector formatting on all decisions
  for (const dec of data.decisions ?? []) {
    if (!Array.isArray(dec.embedding) || dec.embedding.length !== 512) {
      throw new Error(
        `Decision ${dec.id} embedding in ${seedDataPath} is invalid: expected 512 numbers, got ${dec.embedding?.length}`
      );
    }
  }

  // T-05-09: Initialize schema and ensure clean isolated workspace graph
  try {
    await client.query(workspaceId, 'MATCH (n) DETACH DELETE n');
  } catch {
    // Ignore if graph was already empty
  }

  // Init after the reset so the (:Workspace {is_public}) node survives (otherwise showcase workspaces 404)
  await initWorkspaceGraph(client, workspaceId);

  // 1. Components
  if (data.components && data.components.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS c
       MERGE (:Component {name: c.name})`,
      data.components
    );
  }

  // 2. Files and [:IN_COMPONENT] edges
  if (data.files && data.files.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS f
       MERGE (file:File {path: f.path})
       WITH file, f
       MATCH (c:Component {name: f.component})
       MERGE (file)-[:IN_COMPONENT]->(c)`,
      data.files
    );
  }

  // 3. Decisions with vecf32() and [:GOVERNS] edges
  if (data.decisions && data.decisions.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS d
       MERGE (dec:Decision {id: d.id})
       SET dec.title = d.title,
           dec.status = d.status,
           dec.valid_from = d.valid_from,
           dec.valid_to = d.valid_to,
           dec.summary = d.summary,
           dec.source_url = d.source_url,
           dec.embedding = vecf32(d.embedding)
       WITH dec, d
       MATCH (c:Component {name: d.component})
       MERGE (dec)-[:GOVERNS]->(c)`,
      data.decisions
    );

    // 4. [:SUPERSEDES] edges
    const supersedesEdges = data.decisions
      .filter((d) => d.supersedes && d.supersedes.trim().length > 0)
      .map((d) => ({ source_id: d.id, target_id: d.supersedes! }));

    if (supersedesEdges.length > 0) {
      await runBatched(
        client,
        workspaceId,
        `UNWIND $batch AS edge
         MATCH (d1:Decision {id: edge.source_id})
         MATCH (d2:Decision {id: edge.target_id})
         MERGE (d1)-[:SUPERSEDES]->(d2)`,
        supersedesEdges
      );
    }
  }

  // 5. Pull Requests and Reverts
  if (data.reverts && data.reverts.length > 0) {
    const prBatch = data.reverts.map((rev) => ({
      revertId: rev.revertId,
      revertedId: rev.revertedId,
      summary: rev.summary,
      timestamp: rev.timestamp,
    }));

    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS rev
       MERGE (pr1:PullRequest {id: rev.revertId})
       SET pr1.title = rev.summary, pr1.merged_at = rev.timestamp, pr1.is_revert = true
       MERGE (pr2:PullRequest {id: rev.revertedId})
       MERGE (pr1)-[:REVERTS]->(pr2)`,
      prBatch
    );

    const touchesBatch = data.reverts.flatMap((rev) =>
      (rev.files ?? []).map((fpath) => ({
        revertId: rev.revertId,
        path: fpath,
      }))
    );

    if (touchesBatch.length > 0) {
      await runBatched(
        client,
        workspaceId,
        `UNWIND $batch AS item
         MATCH (pr:PullRequest {id: item.revertId})
         MATCH (f:File {path: item.path})
         MERGE (pr)-[:TOUCHES]->(f)`,
        touchesBatch
      );
    }
  }

  // 6. Persons (if present in seed)
  if (data.persons && data.persons.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS p
       MERGE (person:Person {id: p.id})
       SET person.name = p.name, person.display_name = p.name`,
      data.persons
    );
  }

  // 7. Authored edges (if present in seed)
  if (data.authored && data.authored.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS a
       MATCH (p:Person {id: a.author_id})
       MATCH (pr:PullRequest {id: a.pr_id})
       MERGE (p)-[:AUTHORED]->(pr)`,
      data.authored
    );
  }

  // 7b. Pull request metadata (+ files they touched). Merged by id, so the revert nodes created in
  //     step 5 keep their titles; numbers are unique per PullRequest.
  if (data.pullRequests && data.pullRequests.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS p
       MERGE (pr:PullRequest {id: p.id})
       SET pr.number = p.number,
           pr.url = p.url,
           pr.state = p.state,
           pr.title = coalesce(p.title, pr.title),
           pr.merged_at = coalesce(p.merged_at, pr.merged_at),
           pr.is_revert = coalesce(pr.is_revert, false)`,
      data.pullRequests.map((p) => ({
        id: p.id,
        number: p.number ?? null,
        url: p.url ?? null,
        state: p.state ?? null,
        title: p.title ?? null,
        merged_at: p.merged_at ?? null,
      }))
    );

    const touches = data.pullRequests.flatMap((p) =>
      (p.files ?? []).map((path) => ({ prId: p.id, path }))
    );
    if (touches.length > 0) {
      await runBatched(
        client,
        workspaceId,
        `UNWIND $batch AS item
         MATCH (pr:PullRequest {id: item.prId})
         MATCH (f:File {path: item.path})
         MERGE (pr)-[:TOUCHES]->(f)`,
        touches
      );
    }
  }

  // 7c. Reviews: (Person)-[:REVIEWED]->(PullRequest)
  if (data.reviewed && data.reviewed.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS r
       MATCH (p:Person {id: r.reviewer_id})
       MATCH (pr:PullRequest {id: r.pr_id})
       MERGE (p)-[e:REVIEWED]->(pr)
       SET e.state = r.state, e.count = r.count`,
      data.reviewed.map((r) => ({ ...r, state: r.state ?? 'APPROVED', count: r.count ?? 1 }))
    );
  }

  // 7d. Issues, (PullRequest)-[:CLOSES]->(Issue) and the derived (Issue)-[:AFFECTS]->(Component)
  if (data.issues && data.issues.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS i
       MERGE (issue:Issue {id: i.id})
       SET issue.number = i.number,
           issue.title = i.title,
           issue.state = i.state,
           issue.url = i.url,
           issue.created_at = i.created_at`,
      data.issues.map((i) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        state: i.state,
        url: i.url ?? null,
        created_at: i.created_at,
      }))
    );

    const closes = data.issues.flatMap((i) =>
      (i.closed_by ?? []).map((prId) => ({ prId, issueId: i.id }))
    );
    if (closes.length > 0) {
      await runBatched(
        client,
        workspaceId,
        `UNWIND $batch AS c
         MATCH (pr:PullRequest {id: c.prId})
         MATCH (issue:Issue {id: c.issueId})
         MERGE (pr)-[:CLOSES]->(issue)`,
        closes
      );
      await client.query(
        workspaceId,
        `MATCH (issue:Issue)<-[:CLOSES]-(pr:PullRequest)-[:TOUCHES]->(f:File)-[:IN_COMPONENT]->(c:Component)
         WITH issue, c, count(DISTINCT f) AS files
         MERGE (issue)-[r:AFFECTS]->(c)
         SET r.files = files`
      );
    }
  }

  // 7e. Provenance: (Decision)-[:EXTRACTED_FROM]->(PullRequest)
  const extracted = (data.decisions ?? [])
    .filter((d) => d.extracted_from && d.extracted_from.trim().length > 0)
    .map((d) => ({ decisionId: d.id, prId: d.extracted_from! }));
  if (extracted.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS e
       MATCH (d:Decision {id: e.decisionId})
       MATCH (pr:PullRequest {id: e.prId})
       MERGE (d)-[:EXTRACTED_FROM]->(pr)`,
      extracted
    );
  }

  // 7f. Owners of record (CODEOWNERS)
  if (data.owners && data.owners.length > 0) {
    const teams = data.owners.filter((o) => o.kind === 'team');
    const people = data.owners.filter((o) => o.kind === 'person');
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS o
       MERGE (t:Team {id: o.owner_id})
       SET t.name = coalesce(o.name, o.owner_id)`,
      teams
    );
    const edge = (label: 'Team' | 'Person') =>
      `UNWIND $batch AS o
       MATCH (owner:${label} {id: o.owner_id})
       MATCH (c:Component {name: o.component})
       MERGE (owner)-[r:OWNS]->(c)
       SET r.pattern = o.pattern, r.coverage = o.coverage`;
    await runBatched(client, workspaceId, edge('Team'), teams.map((o) => ({ ...o, coverage: o.coverage ?? 1 })));
    await runBatched(client, workspaceId, edge('Person'), people.map((o) => ({ ...o, coverage: o.coverage ?? 1 })));
  }

  // 7g. Synthetic chat decisions (needs components and pull requests to exist). Vectors ship in the
  //     seed, so no embedding model is loaded here.
  if (data.chat) {
    const res = await writeChatThreads(client, workspaceId, data.chat, { embed: false });
    if (!res.embedded) {
      throw new Error(`Chat decisions in ${seedDataPath} have no embedding; regenerate the seed fixture`);
    }
    if (res.skipped.components.length > 0 || res.skipped.pullRequests.length > 0) {
      throw new Error(
        `Chat threads in ${seedDataPath} reference unknown graph entities: ${JSON.stringify(res.skipped)}`
      );
    }
  }

  // 8. DependsOn edges (if present in seed)
  if (data.dependsOn && data.dependsOn.length > 0) {
    await runBatched(
      client,
      workspaceId,
      `UNWIND $batch AS d
       MATCH (c1:Component {name: d.source})
       MATCH (c2:Component {name: d.target})
       MERGE (c1)-[r:DEPENDS_ON]->(c2)
       SET r.weight = d.weight, r.count = d.count`,
      data.dependsOn
    );
  }

  // 9. Query total node count
  const countRes = await client.roQuery(
    workspaceId,
    'MATCH (n) RETURN count(n) AS cnt'
  );
  const nodeCount = Number((countRes.data?.[0] as any)?.cnt ?? 0);

  return { workspaceId, nodeCount };
}

/**
 * Seed all showcase workspaces discovered in the seeds directory.
 */
export async function seedAllShowcaseWorkspaces(
  client: ArgonGraphClient,
  customSeedsDir?: string
): Promise<Record<string, number>> {
  const dir =
    customSeedsDir ??
    (fs.existsSync(path.resolve(__dirname, '../fixtures/seeds'))
      ? path.resolve(__dirname, '../fixtures/seeds')
      : path.resolve(process.cwd(), 'packages/eval/fixtures/seeds'));

  if (!fs.existsSync(dir)) {
    throw new Error(`Showcase seeds directory not found at: ${dir}`);
  }

  const entries = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'reverts.json')
    .sort();

  const summary: Record<string, number> = {};

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const { workspaceId, nodeCount } = await seedWorkspace(client, fullPath);
    summary[workspaceId] = nodeCount;
  }

  return summary;
}
