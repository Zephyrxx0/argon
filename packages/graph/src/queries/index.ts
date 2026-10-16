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
  type DualPayload,
} from './types';

export * from './types';
export * from './auth';

const EMBEDDED_QUERIES: Record<string, string> = {
  '01_resolve_scope.cypher': `// Resolves input paths or component names to existing graph entities
OPTIONAL MATCH (f:File) WHERE f.path IN $paths
OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
WITH collect(DISTINCT f) AS matchedFiles, collect(DISTINCT c) AS matchedComponents
OPTIONAL MATCH (c2:Component) WHERE c2.name IN $names
WITH [f IN matchedFiles WHERE f IS NOT NULL] AS cleanFiles,
     [c IN matchedComponents + collect(DISTINCT c2) WHERE c IS NOT NULL] AS allComponents
RETURN cleanFiles AS matchedFiles, allComponents;`,

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

  '04_who_knows.cypher': `// Evaluates expertise based on PR authorship and review activity in touched components
MATCH (c:Component) WHERE c.name IN $components
MATCH (f:File)-[:IN_COMPONENT]->(c)
MATCH (pr:PullRequest)-[:TOUCHES]->(f)
OPTIONAL MATCH (author:Person)-[:AUTHORED]->(pr)
OPTIONAL MATCH (reviewer:Person)-[:REVIEWED]->(pr)
WITH c.name AS component, author, reviewer, count(DISTINCT pr) AS prCount
RETURN 
  component,
  author.id AS authorId,
  author.display_name AS authorName,
  CASE WHEN author IS NOT NULL THEN prCount ELSE 0 END AS authoredCount,
  reviewer.id AS reviewerId,
  reviewer.display_name AS reviewerName,
  CASE WHEN reviewer IS NOT NULL THEN prCount ELSE 0 END AS reviewedCount;`,

  '05_constraining_decisions.cypher': `// Returns decisions governing the files that were active as of a given timestamp
MATCH (f:File) WHERE f.path IN $files
MATCH (f)-[:IN_COMPONENT]->(c:Component)<-[:GOVERNS]-(d:Decision)
WHERE d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)
RETURN d.id AS id, d.title AS title, d.status AS status, c.name AS component, d.source_url AS sourceUrl;`,

  '06_precedent_search.cypher': `// Performs 512-d cosine vector search over decisions and expands to governed components & PRs
CALL db.idx.vector.queryNodes('Decision', 'embedding', $limit, vecf32($queryVector))
YIELD node, score
OPTIONAL MATCH (node)-[:GOVERNS]->(c:Component)
OPTIONAL MATCH (node)-[:EXTRACTED_FROM]->(pr:PullRequest)
RETURN node AS decision, score, c AS component, pr AS pullRequest
ORDER BY score DESC;`,

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
