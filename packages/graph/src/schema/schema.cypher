// Argon Knowledge Graph Reference Schema (FalkorDB openCypher DDL)
// Conforming to PRD §7.1-7.5, DECISIONS.md §2, and D-07

// ==========================================
// 1. Core Node Labels & Schema Definitions
// ==========================================
//
// (:Person {
//   id: STRING,            // Hashed identity key (from commit email); raw emails never stored
//   display_name: STRING   // Public display name / git author name
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
//   number: INTEGER,       // PR / MR number
//   title: STRING,         // PR title
//   merged_at: INTEGER     // Epoch timestamp in milliseconds of merge
// })
//
// (:Issue {
//   number: INTEGER,       // Issue number
//   title: STRING,         // Issue title
//   state: STRING,         // "open" | "closed"
//   created_at: INTEGER    // Epoch timestamp in milliseconds
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
// (Person)-[:REVIEWED]->(PullRequest)
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
CREATE INDEX FOR (d:Decision) ON (d.id);
CREATE INDEX FOR (b:Briefing) ON (b.id);
CREATE INDEX FOR (j:IngestJob) ON (j.id);
CREATE INDEX FOR (i:Issue) ON (i.id);
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
// User.id UNIQUE
// Workspace.id UNIQUE
// Organization.id UNIQUE

// ==========================================
// 5. 512-Dimensional Vector Index
// ==========================================

CREATE VECTOR INDEX FOR (d:Decision) ON (d.embedding) OPTIONS {dimension: 512, similarityFunction: 'cosine'};
