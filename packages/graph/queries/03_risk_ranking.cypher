// Computes PageRank over component dependencies to identify critical bottlenecks
CALL algo.pageRank('Component', 'DEPENDS_ON')
YIELD node, score
RETURN node.name AS component, score
ORDER BY score DESC
LIMIT $limit;
