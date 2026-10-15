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
    'CREATE INDEX FOR (d:Decision) ON (d.id)',
    'CREATE INDEX FOR (b:Briefing) ON (b.id)',
    'CREATE INDEX FOR (j:IngestJob) ON (j.id)',
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
}
