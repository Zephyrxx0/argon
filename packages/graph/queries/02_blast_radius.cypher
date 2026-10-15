// Traverses touched files through components and dependency chains up to 3 hops
MATCH (f:File) WHERE f.path IN $files
MATCH (f)-[:IN_COMPONENT]->(c:Component)
OPTIONAL MATCH path = (c)-[:DEPENDS_ON*1..3]->(downstream:Component)
RETURN f, c, path, downstream;
