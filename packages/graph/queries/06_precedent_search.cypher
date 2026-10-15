// Performs 512-d cosine vector search over decisions and expands to governed components & PRs
CALL db.idx.vector.queryNodes('Decision', 'embedding', $limit, vecf32($queryVector))
YIELD node, score
OPTIONAL MATCH (node)-[:GOVERNS]->(c:Component)
OPTIONAL MATCH (node)-[:EXTRACTED_FROM]->(pr:PullRequest)
RETURN node AS decision, score, c AS component, pr AS pullRequest
ORDER BY score DESC;
