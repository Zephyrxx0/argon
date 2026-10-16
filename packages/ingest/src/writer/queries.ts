/**
 * Parameterized openCypher templates for batch entity and relationship writes.
 * Each query consumes a `$batch` parameter array conforming to D-15.
 */

export const UPDATE_JOB_STATUS = `
MERGE (j:IngestJob {id: $jobId})
SET j.repo_url = $repoUrl,
    j.status = $status,
    j.progress = $progress,
    j.error = $error,
    j.updated_at = $updatedAt,
    j.started_at = coalesce(j.started_at, $startedAt)
`;

export const BATCH_MERGE_PERSONS = `
UNWIND $batch AS row
MERGE (p:Person {id: row.id})
ON CREATE SET p.name = row.name, p.display_name = row.name, p.email_hash = row.id
`;

export const BATCH_MERGE_FILES = `
UNWIND $batch AS row
MERGE (f:File {path: row.path})
`;

export const BATCH_MERGE_PULL_REQUESTS = `
UNWIND $batch AS row
MERGE (pr:PullRequest {id: row.id})
SET pr.title = row.title,
    pr.merged_at = row.merged_at,
    pr.is_revert = row.is_revert
`;

export const BATCH_MERGE_COMPONENTS = `
UNWIND $batch AS row
MERGE (c:Component {name: row.name})
`;

export const BATCH_MERGE_DECISIONS = `
UNWIND $batch AS row
MERGE (d:Decision {id: row.id})
SET d.title = row.title,
    d.status = row.status,
    d.valid_from = row.valid_from,
    d.valid_to = row.valid_to,
    d.source_url = row.source_url,
    d.source_kind = row.source_kind,
    d.summary = row.summary,
    d.embedding = row.embedding,
    d.embedding_model = 'embeddinggemma-2'
`;

export const BATCH_EDGES_TOUCHES = `
UNWIND $batch AS row
MATCH (pr:PullRequest {id: row.pr_id})
MATCH (f:File {path: row.file_path})
MERGE (pr)-[:TOUCHES]->(f)
`;

export const BATCH_EDGES_AUTHORED = `
UNWIND $batch AS row
MATCH (p:Person {id: row.author_id})
MATCH (pr:PullRequest {id: row.pr_id})
MERGE (p)-[:AUTHORED]->(pr)
`;

export const BATCH_EDGES_IN_COMPONENT = `
UNWIND $batch AS row
MATCH (f:File {path: row.file_path})
MATCH (c:Component {name: row.component_name})
MERGE (f)-[:IN_COMPONENT]->(c)
`;

export const BATCH_EDGES_DEPENDS_ON = `
UNWIND $batch AS row
MATCH (c1:Component {name: row.source})
MATCH (c2:Component {name: row.target})
MERGE (c1)-[r:DEPENDS_ON]->(c2)
SET r.weight = row.weight,
    r.count = row.count
`;

export const BATCH_EDGES_REVERTS = `
UNWIND $batch AS row
MATCH (pr1:PullRequest {id: row.revert_id})
MATCH (pr2:PullRequest {id: row.reverted_id})
MERGE (pr1)-[:REVERTS]->(pr2)
`;

export const BATCH_EDGES_SUPERSEDES = `
UNWIND $batch AS row
MATCH (d1:Decision {id: row.source_id})
MATCH (d2:Decision {id: row.target_id})
MERGE (d1)-[:SUPERSEDES]->(d2)
`;

export const BATCH_EDGES_GOVERNS = `
UNWIND $batch AS row
MATCH (d:Decision {id: row.decision_id})
MATCH (c:Component {name: row.component_name})
MERGE (d)-[:GOVERNS]->(c)
`;

export const LINK_USER_TO_PERSONS_QUERY = `
MERGE (u:User {id: $userId})
ON CREATE SET u.login = $userLogin
SET u.login = coalesce(u.login, $userLogin)
WITH u
MATCH (p:Person)
WHERE (p.email IS NOT NULL AND p.email IN $userEmails)
   OR (p.id IN $userEmailHashes)
   OR (p.email_hash IS NOT NULL AND p.email_hash IN $userEmailHashes)
   OR (p.email IS NOT NULL AND p.email ENDS WITH ('+' + $userLogin + '@users.noreply.github.com'))
   OR (p.email IS NOT NULL AND p.email = ($userLogin + '@users.noreply.github.com'))
   OR toLower(p.name) = toLower($userLogin)
   OR toLower(coalesce(p.display_name, '')) = toLower($userLogin)
MERGE (u)-[r:IDENTIFIES]->(p)
ON CREATE SET r.created_at = timestamp()
RETURN count(r) AS linked_count
`;

export const GET_LINKED_CONTRIBUTORS_QUERY = `
MATCH (u:User)-[r:IDENTIFIES]->(p:Person)
RETURN p.id AS person_id,
       p.name AS name,
       p.display_name AS display_name,
       u.id AS user_id,
       u.login AS login,
       u.avatar_url AS avatar_url,
       u.github_id AS github_id
`;
