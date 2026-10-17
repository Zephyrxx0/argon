import { FalkorDB, Graph, ConstraintType, EntityType } from 'falkordb';
import { ArgonGraphClient } from '../client';

export async function initWorkspaceGraph(
  clientOrDriver: FalkorDB | ArgonGraphClient,
  workspaceId: string
): Promise<void> {
  const graph: Graph =
    clientOrDriver instanceof ArgonGraphClient
      ? clientOrDriver.selectGraph(workspaceId)
      : clientOrDriver.selectGraph(workspaceId);

  // 1. Create standard range indexes
  const indexStatements = [
    'CREATE INDEX FOR (p:Person) ON (p.id)',
    'CREATE INDEX FOR (c:Component) ON (c.name)',
    'CREATE INDEX FOR (f:File) ON (f.path)',
    'CREATE INDEX FOR (pr:PullRequest) ON (pr.number)',
    // Ingest MERGEs pull requests / commits by id; without this index every MERGE scans all PRs.
    'CREATE INDEX FOR (pr:PullRequest) ON (pr.id)',
    'CREATE INDEX FOR (d:Decision) ON (d.id)',
    'CREATE INDEX FOR (b:Briefing) ON (b.id)',
    'CREATE INDEX FOR (j:IngestJob) ON (j.id)',
    'CREATE INDEX FOR (i:Issue) ON (i.id)',
    'CREATE INDEX FOR (t:Team) ON (t.id)',
    'CREATE INDEX FOR (u:User) ON (u.id)',
    'CREATE INDEX FOR (w:Workspace) ON (w.id)',
    'CREATE INDEX FOR (o:Organization) ON (o.id)',
  ];

  for (const stmt of indexStatements) {
    try {
      await graph.query(stmt);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (!msg.includes('already indexed') && !msg.includes('already exists')) {
        throw err;
      }
    }
  }

  // 2. Create Uniqueness Constraints using FalkorDB client API
  const uniqueConstraints = [
    { label: 'Person', prop: 'id' },
    { label: 'Component', prop: 'name' },
    { label: 'File', prop: 'path' },
    { label: 'PullRequest', prop: 'number' },
    { label: 'Decision', prop: 'id' },
    { label: 'IngestJob', prop: 'id' },
    { label: 'Briefing', prop: 'id' },
    { label: 'Issue', prop: 'id' },
    { label: 'Team', prop: 'id' },
    { label: 'User', prop: 'id' },
    { label: 'Workspace', prop: 'id' },
    { label: 'Organization', prop: 'id' },
  ];

  for (const { label, prop } of uniqueConstraints) {
    try {
      await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, label, prop);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (
        !msg.includes('already exists') &&
        !msg.includes('already indexed') &&
        !msg.includes('Constraint already exists')
      ) {
        throw err;
      }
    }
  }

  // 3. Create 512-dimension Cosine Vector Index on Decision.embedding
  try {
    await graph.query(
      `CREATE VECTOR INDEX FOR (d:Decision) ON (d.embedding) OPTIONS {dimension: 512, similarityFunction: 'cosine'}`
    );
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (!msg.includes('already exists') && !msg.includes('already indexed')) {
      throw err;
    }
  }

  // 4. Initialize Workspace node with is_public flag to prevent showcase lockouts (D-09)
  try {
    await graph.query(
      `MERGE (w:Workspace {id: $workspaceId})
       ON CREATE SET w.is_public = (CASE WHEN $workspaceId = 'ember-adr-showcase' OR $workspaceId = 'synthetic-demo' OR $workspaceId = 'argon-dogfood' THEN true ELSE false END)`,
      { params: { workspaceId } }
    );
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (!msg.includes('already exists')) {
      throw err;
    }
  }
}
