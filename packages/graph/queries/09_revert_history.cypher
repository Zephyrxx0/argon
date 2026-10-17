// Finds revert commits that touched the given files, with the change each one reverted.
// A revert on the same files is the strongest "this area has bitten us before" signal.
MATCH (f:File) WHERE f.path IN $files
MATCH (rev:PullRequest)-[:TOUCHES]->(f)
WHERE rev.is_revert = true
OPTIONAL MATCH (rev)-[:REVERTS]->(orig:PullRequest)
RETURN rev AS node, orig AS reverted, collect(DISTINCT f.path) AS files
ORDER BY node.merged_at DESC
LIMIT $limit;
