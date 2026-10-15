import type { ArgonGraphClient } from '../src/client';
import { initWorkspaceGraph } from '../src/schema/init';

export const FIXTURE_VEC_1: number[] = new Array(512).fill(0);
FIXTURE_VEC_1[0] = 1.0;

export const FIXTURE_VEC_2: number[] = new Array(512).fill(0);
FIXTURE_VEC_2[1] = 1.0;

export async function seedTestGraph(
  client: ArgonGraphClient,
  workspaceId: string
): Promise<void> {
  // 1. Delete previous nodes if any exist
  try {
    await client.query(workspaceId, 'MATCH (n) DETACH DELETE n');
  } catch {
    // Workspace graph might not exist yet; safe to proceed
  }

  // 2. Initialize schema (indexes, uniqueness constraints, vector index)
  await initWorkspaceGraph(client, workspaceId);

  // 3. Populate deterministic synthetic topology
  await client.query(
    workspaceId,
    `CREATE (f1:File {path: 'src/auth.ts'})
     CREATE (f2:File {path: 'src/session.ts'})
     CREATE (f3:File {path: 'src/db.ts'})
     CREATE (c1:Component {name: 'Auth'})
     CREATE (c2:Component {name: 'Database'})
     CREATE (c3:Component {name: 'Storage'})
     CREATE (f1)-[:IN_COMPONENT]->(c1)
     CREATE (f2)-[:IN_COMPONENT]->(c1)
     CREATE (f3)-[:IN_COMPONENT]->(c2)
     CREATE (c1)-[:DEPENDS_ON]->(c2)
     CREATE (c2)-[:DEPENDS_ON]->(c3)
     CREATE (d1:Decision {
       id: 'D-01',
       title: 'JWT Auth',
       status: 'superseded',
       valid_from: 1000,
       valid_to: 2000,
       embedding: vecf32($vec1),
       source_url: 'https://github.com/argon/repo/pull/10'
     })
     CREATE (d2:Decision {
       id: 'D-02',
       title: 'Session Cookies',
       status: 'accepted',
       valid_from: 2001,
       embedding: vecf32($vec2),
       source_url: 'https://github.com/argon/repo/pull/20'
     })
     CREATE (d1)-[:GOVERNS]->(c1)
     CREATE (d2)-[:GOVERNS]->(c1)
     CREATE (d2)-[:SUPERSEDES]->(d1)
     CREATE (p1:Person {id: 'alice_hash', display_name: 'Alice'})
     CREATE (pr1:PullRequest {number: 10, title: 'Add JWT', merged_at: 1200})
     CREATE (p1)-[:AUTHORED]->(pr1)
     CREATE (pr1)-[:TOUCHES]->(f1)
     CREATE (d1)-[:EXTRACTED_FROM]->(pr1)`,
    {
      vec1: FIXTURE_VEC_1,
      vec2: FIXTURE_VEC_2,
    }
  );
}
