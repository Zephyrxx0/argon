// Counterfactual impact ("what if I change X?"): every component that is disturbed when the given
// component changes, ranked for decision-making. Two directions over DEPENDS_ON, up to 3 hops:
//   DEPENDENT  = components that depend on X (they break if X changes: dependents, not dependencies)
//   DEPENDENCY = components X relies on (what X's change may be constrained by)
// Each affected component carries: its shortest hop distance, its PageRank centrality
// (algo.pageRank over DEPENDS_ON), the decisions in force at $asOf that govern it (same temporal
// predicate as query 05) and its CODEOWNERS owner(s) of record. Row order is applied by the caller
// (hops ASC, PageRank DESC) because ORDER BY does not span the UNION ALL.
MATCH (x:Component {name: $component})
MATCH p = (x)<-[:DEPENDS_ON*1..3]-(a:Component)
WHERE a <> x
WITH x, a, min(length(p)) AS hops
OPTIONAL MATCH (d:Decision)-[:GOVERNS]->(a)
WHERE d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)
WITH x, a, hops,
     collect(DISTINCT CASE WHEN d IS NULL THEN null ELSE {id: d.id, title: d.title, status: d.status} END) AS decisions
OPTIONAL MATCH (o)-[r:OWNS]->(a)
WHERE o:Person OR o:Team
WITH x, a, hops, decisions,
     collect(DISTINCT CASE WHEN o IS NULL THEN null ELSE {id: o.id, name: coalesce(o.display_name, o.name, o.id), pattern: r.pattern} END) AS owners
CALL algo.pageRank('Component', 'DEPENDS_ON') YIELD node, score
WITH x, a, hops, decisions, owners, node, score
WHERE node = a
RETURN x.name AS target, a.name AS component, 'DEPENDENT' AS direction, hops, score, decisions, owners
LIMIT 500
UNION ALL
MATCH (x:Component {name: $component})
MATCH p = (x)-[:DEPENDS_ON*1..3]->(a:Component)
WHERE a <> x
WITH x, a, min(length(p)) AS hops
OPTIONAL MATCH (d:Decision)-[:GOVERNS]->(a)
WHERE d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)
WITH x, a, hops,
     collect(DISTINCT CASE WHEN d IS NULL THEN null ELSE {id: d.id, title: d.title, status: d.status} END) AS decisions
OPTIONAL MATCH (o)-[r:OWNS]->(a)
WHERE o:Person OR o:Team
WITH x, a, hops, decisions,
     collect(DISTINCT CASE WHEN o IS NULL THEN null ELSE {id: o.id, name: coalesce(o.display_name, o.name, o.id), pattern: r.pattern} END) AS owners
CALL algo.pageRank('Component', 'DEPENDS_ON') YIELD node, score
WITH x, a, hops, decisions, owners, node, score
WHERE node = a
RETURN x.name AS target, a.name AS component, 'DEPENDENCY' AS direction, hops, score, decisions, owners
LIMIT 500;
