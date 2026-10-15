// Returns decisions governing the files that were active as of a given timestamp
MATCH (f:File) WHERE f.path IN $files
MATCH (f)-[:IN_COMPONENT]->(c:Component)<-[:GOVERNS]-(d:Decision)
WHERE d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)
RETURN d.id AS id, d.title AS title, d.status AS status, c.name AS component, d.source_url AS sourceUrl;
