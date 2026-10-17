// Performs 512-d cosine vector search over decisions and expands to governed components, the
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
