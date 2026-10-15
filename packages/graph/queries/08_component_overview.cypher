// Returns summary statistics, governed decisions, and connected dependencies for a component
MATCH (c:Component {name: $component})
OPTIONAL MATCH (f:File)-[:IN_COMPONENT]->(c)
OPTIONAL MATCH (d:Decision)-[:GOVERNS]->(c)
OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Component)
RETURN 
  c.name AS name,
  count(DISTINCT f) AS fileCount,
  count(DISTINCT d) AS decisionCount,
  collect(DISTINCT dep.name) AS dependencies;
