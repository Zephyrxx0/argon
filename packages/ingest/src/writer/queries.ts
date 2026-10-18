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

export const TOUCH_JOB = `
MATCH (j:IngestJob {id: $jobId})
WHERE j.status <> 'completed' AND j.status <> 'failed'
SET j.updated_at = $updatedAt
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
    // Only set for chat decisions (always true there: chat data is synthetic); null elsewhere
    d.synthetic = row.synthetic,
    d.source_channel = row.source_channel,
    // Only vecf32 values enter FalkorDB's vector index; a plain list property is invisible to
    // db.idx.vector.queryNodes, which made precedent search return nothing on ingested repos.
    d.embedding = CASE WHEN row.embedding IS NULL THEN NULL ELSE vecf32(row.embedding) END,
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

export const BATCH_EDGES_CO_CHANGES = `
UNWIND $batch AS row
MATCH (f1:File {path: row.source})
MATCH (f2:File {path: row.target})
MERGE (f1)-[r:CO_CHANGES]->(f2)
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

// ---------------------------------------------------------------------------
// Company Brain: provenance, GitHub pull requests / reviews / issues, ownership
// ---------------------------------------------------------------------------

/** (Decision)-[:EXTRACTED_FROM]->(PullRequest): where a decision was found. */
export const BATCH_EDGES_EXTRACTED_FROM = `
UNWIND $batch AS row
MATCH (d:Decision {id: row.decision_id})
MATCH (pr:PullRequest {id: row.pr_id})
MERGE (d)-[:EXTRACTED_FROM]->(pr)
`;

/** GitHub metadata for a PullRequest node that already exists (a mined merge commit). */
export const BATCH_UPDATE_PULL_REQUESTS = `
UNWIND $batch AS row
MATCH (pr:PullRequest {id: row.id})
SET pr.number = row.number,
    pr.url = row.url,
    pr.state = row.state,
    pr.body_excerpt = row.body_excerpt,
    pr.github_title = row.title
`;

/** A merged GitHub PR whose merge commit is outside the mined history. */
export const BATCH_MERGE_PLACEHOLDER_PULL_REQUESTS = `
UNWIND $batch AS row
MERGE (pr:PullRequest {id: row.id})
SET pr.number = row.number,
    pr.title = row.title,
    pr.url = row.url,
    pr.state = row.state,
    pr.body_excerpt = row.body_excerpt,
    pr.merged_at = row.merged_at,
    pr.is_revert = row.is_revert
`;

/** Placeholders superseded by a commit node (frees the unique PullRequest.number). */
export const RETIRE_PLACEHOLDER_PULL_REQUESTS = `
MATCH (pr:PullRequest)
WHERE pr.id IN $ids AND pr.id STARTS WITH 'pr_gh_'
DETACH DELETE pr
`;

/** GitHub accounts that could not be matched to a git author. */
export const BATCH_MERGE_GITHUB_PERSONS = `
UNWIND $batch AS row
MERGE (p:Person {id: row.id})
ON CREATE SET p.name = row.login, p.display_name = row.login
SET p.github_login = row.login
`;

/** Records the GitHub login of a person known from git history. */
export const BATCH_SET_PERSON_LOGIN = `
UNWIND $batch AS row
MATCH (p:Person {id: row.id})
SET p.github_login = row.login
`;

export const BATCH_EDGES_REVIEWED = `
UNWIND $batch AS row
MATCH (p:Person {id: row.reviewer_id})
MATCH (pr:PullRequest {id: row.pr_id})
MERGE (p)-[r:REVIEWED]->(pr)
SET r.state = row.state,
    r.count = row.count,
    r.last_at = row.last_at
`;

export const BATCH_MERGE_ISSUES = `
UNWIND $batch AS row
MERGE (i:Issue {id: row.id})
SET i.number = row.number,
    i.title = row.title,
    i.state = row.state,
    i.url = row.url,
    i.created_at = row.created_at
`;

export const BATCH_EDGES_CLOSES = `
UNWIND $batch AS row
MATCH (pr:PullRequest {id: row.pr_id})
MATCH (i:Issue {id: row.issue_id})
MERGE (pr)-[:CLOSES]->(i)
`;

/** (Issue)-[:AFFECTS]->(Component), derived through the files of the PRs that close the issue. */
export const BATCH_DERIVE_ISSUE_AFFECTS = `
UNWIND $ids AS issueId
MATCH (i:Issue {id: issueId})<-[:CLOSES]-(pr:PullRequest)-[:TOUCHES]->(f:File)-[:IN_COMPONENT]->(c:Component)
WITH i, c, count(DISTINCT f) AS files
MERGE (i)-[r:AFFECTS]->(c)
SET r.files = files
`;

export const READ_PULL_REQUEST_IDS_BY_NUMBER = `
MATCH (pr:PullRequest)
WHERE pr.number IN $numbers
RETURN pr.number AS number, pr.id AS id
`;

export const READ_EXISTING_PULL_REQUEST_IDS = `
MATCH (pr:PullRequest)
WHERE pr.id IN $ids
RETURN pr.id AS id
`;

export const READ_EXISTING_DECISIONS = `
MATCH (d:Decision)
WHERE d.id IN $ids
RETURN d.id AS id, d.status AS status
`;

export const READ_EXISTING_FILES = `
MATCH (f:File)
WHERE f.path IN $paths
RETURN f.path AS path
`;

/** Ownership is replaced on every ingest, so a removed CODEOWNERS rule does not linger. */
export const DELETE_COMPONENT_OWNERSHIP = `
MATCH ()-[r:OWNS]->(:Component)
DELETE r
`;

export const BATCH_MERGE_TEAMS = `
UNWIND $batch AS row
MERGE (t:Team {id: row.id})
SET t.name = row.name
`;

export const BATCH_EDGES_OWNS_PERSON = `
UNWIND $batch AS row
MATCH (o:Person {id: row.owner_id})
MATCH (c:Component {name: row.component_name})
MERGE (o)-[r:OWNS]->(c)
SET r.pattern = row.pattern,
    r.coverage = row.coverage
`;

export const BATCH_EDGES_OWNS_TEAM = `
UNWIND $batch AS row
MATCH (o:Team {id: row.owner_id})
MATCH (c:Component {name: row.component_name})
MERGE (o)-[r:OWNS]->(c)
SET r.pattern = row.pattern,
    r.coverage = row.coverage
`;

export const SET_JOB_GITHUB_STATUS = `
MATCH (j:IngestJob {id: $jobId})
SET j.github_status = $status,
    j.github_note = $note
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
   OR toLower(coalesce(p.github_login, '')) = toLower($userLogin)
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
