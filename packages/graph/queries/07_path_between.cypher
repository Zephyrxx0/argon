// Finds the shortest dependency path between two components via FalkorDB algo.SPpaths
MATCH (src:Component {name: $sourceName}), (tgt:Component {name: $targetName})
CALL algo.SPpaths({
  sourceNode: src,
  targetNode: tgt,
  relTypes: ['DEPENDS_ON'],
  pathCount: 1
})
YIELD path, pathWeight
RETURN path, pathWeight;
