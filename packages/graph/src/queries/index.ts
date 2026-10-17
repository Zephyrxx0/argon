import fs from 'node:fs';
import path from 'node:path';
import type { ArgonGraphClient } from '../client';
import { toCytoscapeElements } from '../transformers/cytoscape';
import {
  ResolveScopeParamsSchema,
  ResolveScopeResultSchema,
  type ResolveScopeParams,
  type ResolveScopeResult,
  BlastRadiusParamsSchema,
  BlastRadiusResultSchema,
  type BlastRadiusParams,
  type BlastRadiusResult,
  RiskRankingParamsSchema,
  RiskRankingResultSchema,
  type RiskRankingParams,
  type RiskRankingResult,
  WhoKnowsParamsSchema,
  WhoKnowsResultSchema,
  type WhoKnowsParams,
  type WhoKnowsResult,
  ConstrainingDecisionsParamsSchema,
  ConstrainingDecisionsResultSchema,
  type ConstrainingDecisionsParams,
  type ConstrainingDecisionsResult,
  PrecedentSearchParamsSchema,
  PrecedentSearchResultSchema,
  type PrecedentSearchParams,
  type PrecedentSearchResult,
  PathBetweenParamsSchema,
  PathBetweenResultSchema,
  type PathBetweenParams,
  type PathBetweenResult,
  ComponentOverviewParamsSchema,
  ComponentOverviewResultSchema,
  type ComponentOverviewParams,
  type ComponentOverviewResult,
  RevertHistoryParamsSchema,
  RevertHistoryResultSchema,
  type RevertHistoryParams,
  type RevertHistoryResult,
  type DualPayload,
} from './types';

export * from './types';
export * from './auth';
export * from './sync';

const EMBEDDED_QUERIES: Record<string, string> = {
  '01_resolve_scope.cypher': `// Resolves input paths or component names to existing graph entities
OPTIONAL MATCH (f:File) WHERE f.path IN $paths
OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
WITH collect(DISTINCT f) AS matchedFiles, collect(DISTINCT c) AS matchedComponents
OPTIONAL MATCH (c2:Component) WHERE c2.name IN $names
WITH matchedFiles, matchedComponents, collect(DISTINCT c2) AS namedComponents
RETURN [f IN matchedFiles WHERE f IS NOT NULL] AS matchedFiles,
       [c IN matchedComponents + namedComponents WHERE c IS NOT NULL] AS allComponents;
`,

  '02_blast_radius.cypher': `// Traverses touched files through components and dependency chains up to 3 hops
MATCH (f:File) WHERE f.path IN $files
MATCH (f)-[:IN_COMPONENT]->(c:Component)
OPTIONAL MATCH path = (c)-[:DEPENDS_ON*1..3]->(downstream:Component)
RETURN f, c, path, downstream;`,

  '03_risk_ranking.cypher': `// Computes PageRank over component dependencies to identify critical bottlenecks
CALL algo.pageRank('Component', 'DEPENDS_ON')
YIELD node, score
RETURN node.name AS component, score
ORDER BY score DESC
LIMIT $limit;`,

  '04_who_knows.cypher': `// Evaluates expertise per component from three independent facts: PRs a person authored, PRs a
// person reviewed, and who CODEOWNERS names as owner of record.
// Each fact is aggregated in its OWN branch (UNION ALL). Joining authors and reviewers in one
// MATCH multiplies rows (author x reviewer), so a PR with two reviewers would count twice for
// its author. Every row has the same columns; unused ones are null / 0.
MATCH (c:Component) WHERE c.name IN $components
MATCH (f:File)-[:IN_COMPONENT]->(c)
MATCH (pr:PullRequest)-[:TOUCHES]->(f)
MATCH (author:Person)-[:AUTHORED]->(pr)
WITH c.name AS component, author, count(DISTINCT pr) AS prCount
RETURN
  component,
  author.id AS authorId,
  coalesce(author.display_name, author.name) AS authorName,
  prCount AS authoredCount,
  null AS reviewerId,
  null AS reviewerName,
  0 AS reviewedCount,
  null AS ownerId,
  null AS ownerName,
  null AS ownerPattern
UNION ALL
MATCH (c:Component) WHERE c.name IN $components
MATCH (f:File)-[:IN_COMPONENT]->(c)
MATCH (pr:PullRequest)-[:TOUCHES]->(f)
MATCH (reviewer:Person)-[:REVIEWED]->(pr)
WITH c.name AS component, reviewer, count(DISTINCT pr) AS prCount
RETURN
  component,
  null AS authorId,
  null AS authorName,
  0 AS authoredCount,
  reviewer.id AS reviewerId,
  coalesce(reviewer.display_name, reviewer.name) AS reviewerName,
  prCount AS reviewedCount,
  null AS ownerId,
  null AS ownerName,
  null AS ownerPattern
UNION ALL
MATCH (c:Component) WHERE c.name IN $components
MATCH (owner)-[r:OWNS]->(c)
WHERE owner:Person OR owner:Team
RETURN
  c.name AS component,
  null AS authorId,
  null AS authorName,
  0 AS authoredCount,
  null AS reviewerId,
  null AS reviewerName,
  0 AS reviewedCount,
  owner.id AS ownerId,
  coalesce(owner.display_name, owner.name, owner.id) AS ownerName,
  r.pattern AS ownerPattern;
`,

  '05_constraining_decisions.cypher': `// Returns decisions governing the files that were active as of a given timestamp, with their
// provenance: the pull request each decision was extracted from and the issue that PR closes.
// A component can have more than one decision in force; the result order is made deterministic
// (newest effective first, then id) so the benchmark is reproducible across FalkorDB versions.
MATCH (f:File) WHERE f.path IN $files
MATCH (f)-[:IN_COMPONENT]->(c:Component)<-[:GOVERNS]-(d:Decision)
WHERE d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)
OPTIONAL MATCH (d)-[:EXTRACTED_FROM]->(pr:PullRequest)
OPTIONAL MATCH (pr)-[:CLOSES]->(i:Issue)
RETURN DISTINCT d.id AS id, d.title AS title, d.status AS status, c.name AS component,
       d.source_url AS sourceUrl,
       pr.id AS prId, pr.number AS prNumber, pr.url AS prUrl,
       i.id AS issueId, i.number AS issueNumber, i.url AS issueUrl, i.state AS issueState
ORDER BY d.valid_from DESC, d.id ASC;
`,

  '06_precedent_search.cypher': `// Performs 512-d cosine vector search over decisions and expands to governed components, the
// pull request the decision was extracted from, and the issue that PR closes (provenance).
// FalkorDB's vector index yields cosine DISTANCE (0 = identical); convert to similarity so that
// higher is better (and ORDER BY ... DESC puts the closest decision first).
CALL db.idx.vector.queryNodes('Decision', 'embedding', $limit, vecf32($queryVector))
YIELD node, score
OPTIONAL MATCH (node)-[:GOVERNS]->(c:Component)
OPTIONAL MATCH (node)-[:EXTRACTED_FROM]->(pr:PullRequest)
OPTIONAL MATCH (pr)-[:CLOSES]->(issue:Issue)
RETURN node AS decision, (1.0 - score) AS score, c AS component, pr AS pullRequest, issue AS issue
ORDER BY score DESC;
`,

  '07_path_between.cypher': `// Finds the shortest dependency path between two components via FalkorDB algo.SPpaths
MATCH (src:Component {name: $sourceName}), (tgt:Component {name: $targetName})
CALL algo.SPpaths({
  sourceNode: src,
  targetNode: tgt,
  relTypes: ['DEPENDS_ON'],
  pathCount: 1
})
YIELD path, pathWeight
RETURN path, pathWeight;`,

  '08_component_overview.cypher': `// Returns summary statistics, governed decisions, and connected dependencies for a component
MATCH (c:Component {name: $component})
OPTIONAL MATCH (f:File)-[:IN_COMPONENT]->(c)
OPTIONAL MATCH (d:Decision)-[:GOVERNS]->(c)
OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Component)
RETURN 
  c.name AS name,
  count(DISTINCT f) AS fileCount,
  count(DISTINCT d) AS decisionCount,
  collect(DISTINCT dep.name) AS dependencies;`,

  '09_revert_history.cypher': `// Finds revert commits that touched the given files, with the change each one reverted.
// A revert on the same files is the strongest "this area has bitten us before" signal.
MATCH (f:File) WHERE f.path IN $files
MATCH (rev:PullRequest)-[:TOUCHES]->(f)
WHERE rev.is_revert = true
OPTIONAL MATCH (rev)-[:REVERTS]->(orig:PullRequest)
RETURN rev AS node, orig AS reverted, collect(DISTINCT f.path) AS files
ORDER BY node.merged_at DESC
LIMIT $limit;
`,
};

export function getCypherQuery(fileName: string): string {
  try {
    const candidates = [
      path.resolve(__dirname, '../../queries', fileName),
      path.resolve(__dirname, '../queries', fileName),
      path.resolve(process.cwd(), 'packages/graph/queries', fileName),
      path.resolve(process.cwd(), 'queries', fileName),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }
  } catch {
    // Fall back to embedded query definitions
  }
  return EMBEDDED_QUERIES[fileName] ?? '';
}

export async function resolveScope(
  client: ArgonGraphClient,
  workspaceId: string,
  params: ResolveScopeParams
): Promise<DualPayload<ResolveScopeResult>> {
  const validated = ResolveScopeParamsSchema.parse(params);
  const cypher = getCypherQuery('01_resolve_scope.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    paths: validated.paths,
    names: validated.names,
  });
  const raw = (res.data ?? []) as ResolveScopeResult;
  ResolveScopeResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function blastRadius(
  client: ArgonGraphClient,
  workspaceId: string,
  params: BlastRadiusParams
): Promise<DualPayload<BlastRadiusResult>> {
  const validated = BlastRadiusParamsSchema.parse(params);
  const maxDepth = Math.min(Math.max(1, validated.maxDepth ?? 3), 5);
  const baseCypher = getCypherQuery('02_blast_radius.cypher');
  const cypher = baseCypher.replace('*1..3', `*1..${maxDepth}`);
  const res = await client.roQuery(workspaceId, cypher, {
    files: validated.files,
  });
  const raw = (res.data ?? []) as BlastRadiusResult;
  BlastRadiusResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function riskRanking(
  client: ArgonGraphClient,
  workspaceId: string,
  params: RiskRankingParams = { limit: 10 }
): Promise<DualPayload<RiskRankingResult>> {
  const validated = RiskRankingParamsSchema.parse(params);
  const cypher = getCypherQuery('03_risk_ranking.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    limit: validated.limit,
  });
  const raw = (res.data ?? []) as RiskRankingResult;
  RiskRankingResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function whoKnows(
  client: ArgonGraphClient,
  workspaceId: string,
  params: WhoKnowsParams
): Promise<DualPayload<WhoKnowsResult>> {
  const validated = WhoKnowsParamsSchema.parse(params);
  const cypher = getCypherQuery('04_who_knows.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    components: validated.components,
  });
  const raw = (res.data ?? []) as WhoKnowsResult;
  WhoKnowsResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function constrainingDecisions(
  client: ArgonGraphClient,
  workspaceId: string,
  params: ConstrainingDecisionsParams
): Promise<DualPayload<ConstrainingDecisionsResult>> {
  const validated = ConstrainingDecisionsParamsSchema.parse(params);
  const cypher = getCypherQuery('05_constraining_decisions.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    files: validated.files,
    asOf: validated.asOf,
  });
  const raw = (res.data ?? []) as ConstrainingDecisionsResult;
  ConstrainingDecisionsResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function precedentSearch(
  client: ArgonGraphClient,
  workspaceId: string,
  params: PrecedentSearchParams
): Promise<DualPayload<PrecedentSearchResult>> {
  const validated = PrecedentSearchParamsSchema.parse(params);
  const cypher = getCypherQuery('06_precedent_search.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    queryVector: validated.queryVector,
    limit: validated.limit,
  });
  const raw = (res.data ?? []) as PrecedentSearchResult;
  PrecedentSearchResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function pathBetween(
  client: ArgonGraphClient,
  workspaceId: string,
  params: PathBetweenParams
): Promise<DualPayload<PathBetweenResult>> {
  const validated = PathBetweenParamsSchema.parse(params);
  const cypher = getCypherQuery('07_path_between.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    sourceName: validated.sourceName,
    targetName: validated.targetName,
  });
  const raw = (res.data ?? []) as PathBetweenResult;
  PathBetweenResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function componentOverview(
  client: ArgonGraphClient,
  workspaceId: string,
  params: ComponentOverviewParams
): Promise<DualPayload<ComponentOverviewResult>> {
  const validated = ComponentOverviewParamsSchema.parse(params);
  const cypher = getCypherQuery('08_component_overview.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    component: validated.component,
  });
  const raw = (res.data ?? []) as ComponentOverviewResult;
  ComponentOverviewResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}

export async function revertHistory(
  client: ArgonGraphClient,
  workspaceId: string,
  params: RevertHistoryParams
): Promise<DualPayload<RevertHistoryResult>> {
  const validated = RevertHistoryParamsSchema.parse(params);
  const cypher = getCypherQuery('09_revert_history.cypher');
  const res = await client.roQuery(workspaceId, cypher, {
    files: validated.files,
    limit: validated.limit,
  });
  const raw = (res.data ?? []) as RevertHistoryResult;
  RevertHistoryResultSchema.parse(raw);
  return toCytoscapeElements(raw);
}
