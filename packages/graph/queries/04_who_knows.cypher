// Evaluates expertise based on PR authorship and review activity in touched components
MATCH (c:Component) WHERE c.name IN $components
MATCH (f:File)-[:IN_COMPONENT]->(c)
MATCH (pr:PullRequest)-[:TOUCHES]->(f)
OPTIONAL MATCH (author:Person)-[:AUTHORED]->(pr)
OPTIONAL MATCH (reviewer:Person)-[:REVIEWED]->(pr)
WITH c.name AS component, author, reviewer, pr.merged_at AS mergedAt
RETURN 
  component,
  author.id AS authorId,
  author.display_name AS authorName,
  count(DISTINCT author) AS authoredCount,
  reviewer.id AS reviewerId,
  reviewer.display_name AS reviewerName,
  count(DISTINCT reviewer) AS reviewedCount;
