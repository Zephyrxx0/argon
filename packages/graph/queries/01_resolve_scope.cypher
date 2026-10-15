// Resolves input paths or component names to existing graph entities
OPTIONAL MATCH (f:File) WHERE f.path IN $paths
OPTIONAL MATCH (f)-[:IN_COMPONENT]->(c:Component)
WITH collect(DISTINCT f) AS matchedFiles, collect(DISTINCT c) AS matchedComponents
OPTIONAL MATCH (c2:Component) WHERE c2.name IN $names
WITH [f IN matchedFiles WHERE f IS NOT NULL] AS cleanFiles,
     [c IN matchedComponents + collect(DISTINCT c2) WHERE c IS NOT NULL] AS allComponents
RETURN cleanFiles AS matchedFiles, allComponents;
