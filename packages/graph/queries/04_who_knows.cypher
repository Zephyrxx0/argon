// Evaluates expertise per component from three independent facts: PRs a person authored, PRs a
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
