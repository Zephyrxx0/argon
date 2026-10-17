// Argon Knowledge Graph Reference Schema (FalkorDB openCypher DDL)
// Conforming to PRD §7.1-7.5, DECISIONS.md §2, and D-07

// ==========================================
// 1. Core Node Labels & Schema Definitions
// ==========================================
//
// (:Person {
//   id: STRING,            // Hashed identity key (from commit email), or "gh_<login>" for a GitHub
//                          // account that could not be matched to a commit author; raw emails never stored
//   display_name: STRING,  // Public display name / git author name
//   github_login: STRING   // GitHub login, when known (reviews / CODEOWNERS / PR authors)
// })
//
// (:Team {
//   id: STRING,            // CODEOWNERS team handle, e.g. "@acme/platform"
//   name: STRING
// })
//
// (:Component {
//   name: STRING           // Directory / co-change community component name
// })
//
// (:File {
//   path: STRING           // Normalized repository-relative file path
// })
//
// (:PullRequest {
//   id: STRING,            // "pr_<sha12>" (one per git commit), or "pr_gh_<number>" for a GitHub PR
//                          // whose merge commit is outside the mined history
//   number: INTEGER,       // GitHub PR number (set once the commit is matched to a GitHub PR)
//   title: STRING,         // PR title / commit subject
//   url: STRING,           // https://github.com/<owner>/<repo>/pull/<n> (or the commit URL)
//   state: STRING,         // "merged" | "closed" | "open"
//   body_excerpt: STRING,  // first ~300 chars of the PR description
//   is_revert: BOOLEAN,
//   merged_at: INTEGER     // Epoch seconds of merge / commit
// })
//
// (:Issue {
//   id: STRING,            // "issue_<number>"
//   number: INTEGER,       // Issue number
//   title: STRING,         // Issue title
//   state: STRING,         // "open" | "closed"
//   url: STRING,           // https://github.com/<owner>/<repo>/issues/<n>
//   created_at: INTEGER    // Epoch seconds
// })
//
// (:Decision {
//   id: STRING,            // Unique decision identifier (e.g., "ADR-001" or sha256)
//   title: STRING,         // Human-readable title of the decision
//   status: STRING,        // "proposed" | "accepted" | "superseded"
//   valid_from: INTEGER,   // Epoch timestamp in milliseconds when decision took effect
//   valid_to: INTEGER,     // Epoch timestamp in milliseconds when superseded (or NULL if current)
//   source_url: STRING,    // URL or repo-relative link to source document / PR
//   source_kind: STRING,   // "adr" | "rfc" | "pr" | "commit" | "doc" | "comment"
//   embedding: VECTOR,     // 512-dimensional cosine vector
//   embedding_model: STRING // Model identifier (e.g., "onnx-community/embeddinggemma-2-ONNX" or "text-embedding-004")
// })
//
// (:Briefing {
//   id: STRING,            // Unique briefing identifier (UUID)
//   created_at: INTEGER,   // Epoch timestamp in milliseconds
//   scope_hash: STRING     // Hash of resolved scope parameters for caching
// })
//
// (:IngestJob {
//   id: STRING,            // Unique ingest job identifier
//   repo_url: STRING,      // Repository URL being ingested
//   status: STRING,        // "queued" | "cloning" | "mining" | "indexing" | "completed" | "failed"
//   progress: FLOAT,       // Progress percentage [0.0 - 1.0]
//   error: STRING,         // Failure error message (or empty)
//   started_at: INTEGER,   // Epoch timestamp in milliseconds
//   updated_at: INTEGER    // Epoch timestamp in milliseconds
// })
//
// (:User {
//   id: STRING,            // Better Auth userId or guest UUID
//   github_id: STRING,     // GitHub numeric ID as string (null for guests)
//   login: STRING,         // GitHub username or guest handle
//   avatar_url: STRING,    // Avatar URL or fallback placeholder
//   created_at: INTEGER    // Epoch timestamp in milliseconds
//                          // NOTE: Raw emails MUST NOT be stored in FalkorDB per D-10
// })
//
// (:Workspace {
//   id: STRING,            // Workspace repository identifier (e.g. 'ember-adr-showcase')
//   is_public: BOOLEAN,    // true for showcase repos per D-09, false for private user repos
//   name: STRING,          // Workspace display name
//   repo_url: STRING       // Repository git URL
// })
//
// (:Organization {
//   id: STRING,            // Unique organization identifier
//   name: STRING,          // Organization display name
//   created_at: INTEGER    // Epoch timestamp in milliseconds
// })

// ==========================================
// 2. Core Relationship Types
// ==========================================
//
// (Person)-[:AUTHORED]->(PullRequest)
// (Person)-[:REVIEWED]->(PullRequest)         // written by the GitHub ingest stage (and showcase seeds)
// (PullRequest)-[:CLOSES]->(Issue)            // parsed from "Fixes #n" in the PR title / body
// (Issue)-[:AFFECTS {files}]->(Component)     // derived through the closing PR's touched files
// (Person|Team)-[:OWNS {pattern, coverage}]->(Component)  // CODEOWNERS owner of record
// (PullRequest)-[:TOUCHES]->(File)
// (File)-[:IN_COMPONENT]->(Component)
// (Component)-[:DEPENDS_ON]->(Component)
// (Decision)-[:GOVERNS]->(Component)
// (Decision)-[:SUPERSEDES]->(Decision)
// (Decision)-[:EXTRACTED_FROM]->(PullRequest)
// (PullRequest)-[:REVERTS]->(PullRequest)
// (Person)-[:FAMILIAR_WITH {strength: FLOAT}]->(Component)
// (Briefing)-[:CITES {reason: STRING}]->(Decision)
// (Briefing)-[:ABOUT]->(Component)
// (User)-[:ACCESSES { role: 'owner' | 'member' | 'viewer' }]->(Workspace)
// (User)-[:MEMBER_OF { role: 'admin' | 'member' }]->(Organization)
// (Organization)-[:OWNS]->(Workspace)

// ==========================================
// 3. Range Indexes
// ==========================================

CREATE INDEX FOR (p:Person) ON (p.id);
CREATE INDEX FOR (c:Component) ON (c.name);
CREATE INDEX FOR (f:File) ON (f.path);
CREATE INDEX FOR (pr:PullRequest) ON (pr.number);
CREATE INDEX FOR (pr:PullRequest) ON (pr.id);
CREATE INDEX FOR (d:Decision) ON (d.id);
CREATE INDEX FOR (b:Briefing) ON (b.id);
CREATE INDEX FOR (j:IngestJob) ON (j.id);
CREATE INDEX FOR (i:Issue) ON (i.id);
CREATE INDEX FOR (t:Team) ON (t.id);
CREATE INDEX FOR (u:User) ON (u.id);
CREATE INDEX FOR (w:Workspace) ON (w.id);
CREATE INDEX FOR (o:Organization) ON (o.id);

// ==========================================
// 4. Uniqueness Constraints
// (In FalkorDB applied via GRAPH.CONSTRAINT CREATE or driver API)
// ==========================================
// Person.id UNIQUE
// Component.name UNIQUE
// File.path UNIQUE
// PullRequest.number UNIQUE
// Decision.id UNIQUE
// IngestJob.id UNIQUE
// Briefing.id UNIQUE
// Issue.id UNIQUE
// Team.id UNIQUE
// User.id UNIQUE
// Workspace.id UNIQUE
// Organization.id UNIQUE

// ==========================================
// 5. 512-Dimensional Vector Index
// ==========================================

CREATE VECTOR INDEX FOR (d:Decision) ON (d.embedding) OPTIONS {dimension: 512, similarityFunction: 'cosine'};
