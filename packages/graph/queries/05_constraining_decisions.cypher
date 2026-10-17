// Returns decisions governing the files that were active as of a given timestamp, with their
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
