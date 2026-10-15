// Evaluates expertise based on PR authorship and review activity in touched components
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
  CASE WHEN reviewer IS NOT NULL THEN prCount ELSE 0 END AS reviewedCount;
