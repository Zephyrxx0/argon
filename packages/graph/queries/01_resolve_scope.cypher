// Resolves input paths or component names to existing graph entities
MATCH (f:File) WHERE f.path IN $paths
OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
WITH collect(DISTINCT f) AS matchedFiles, collect(DISTINCT c) AS matchedComponents
OPTIONAL MATCH (c2:Component) WHERE c2.name IN $names
WITH matchedFiles, matchedComponents + collect(DISTINCT c2) AS allComponents
RETURN matchedFiles, allComponents;
