// Resolves input paths or component names to existing graph entities
OPTIONAL MATCH (f:File) WHERE f.path IN $paths
OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
WITH collect(DISTINCT f) AS matchedFiles, collect(DISTINCT c) AS matchedComponents
OPTIONAL MATCH (c2:Component) WHERE c2.name IN $names
WITH matchedFiles, matchedComponents, collect(DISTINCT c2) AS namedComponents
RETURN [f IN matchedFiles WHERE f IS NOT NULL] AS matchedFiles,
       [c IN matchedComponents + namedComponents WHERE c IS NOT NULL] AS allComponents;
