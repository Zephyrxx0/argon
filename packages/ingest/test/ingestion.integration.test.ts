import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient, whoKnows } from '@argon/graph';
import { runIngestion } from '../src/index.js';
import { createFixtureRepository } from './fixture-repo.js';

// Probe FalkorDB reachability at suite load time for graceful skips if offline
const isFalkorLive = await (async () => {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const reachable = await probe.ping();
    await probe.close();
    return reachable;
  } catch {
    return false;
  }
})();

describe('ingestion pipeline integration', () => {
  describe.skipIf(!isFalkorLive)('live FalkorDB pipeline execution', () => {
    let client: ArgonGraphClient;
    const workspaceId = 'test_ingest_pipeline_ws';

    beforeAll(async () => {
      client = new ArgonGraphClient({
        url: process.env.FALKORDB_URL || 'falkor://localhost:6379',
      });
      await client.connect();
    });

    afterAll(async () => {
      try {
        await client.query(workspaceId, 'MATCH (n) DETACH DELETE n');
      } catch {
        // Ignore cleanup error
      }
      await client.close();
    });

  it('runs complete ingestion pipeline and verifies all graph structures in FalkorDB', async () => {
    // 1. Build deterministic local fixture repo
    const fixture = await createFixtureRepository();

    try {
      // 2. Execute full ingestion
      const summary = await runIngestion({
        repoUrl: `file://${fixture.dir}`,
        workspaceId,
        client,
      });

      expect(summary.commitCount).toBeGreaterThanOrEqual(9);
      expect(summary.fileCount).toBeGreaterThanOrEqual(4);
      expect(summary.componentCount).toBeGreaterThanOrEqual(2);
      expect(summary.decisionCount).toBeGreaterThanOrEqual(2);
      expect(summary.revertCount).toBeGreaterThanOrEqual(1);

      // 3. Verify IngestJob status
      const jobResult = await client.roQuery(
        workspaceId,
        `MATCH (j:IngestJob {id: $jobId}) RETURN j.status AS status, j.progress AS progress`,
        { jobId: summary.jobId }
      );
      expect(jobResult.data).toHaveLength(1);
      expect((jobResult.data as any)[0].status).toBe('completed');
      expect((jobResult.data as any)[0].progress).toBe(1.0);

      // 4. Verify Components and DEPENDS_ON edges
      const compResult = await client.roQuery(
        workspaceId,
        `MATCH (c1:Component)-[r:DEPENDS_ON]->(c2:Component)
         RETURN c1.name AS src, c2.name AS target, r.weight AS weight, r.count AS count`
      );
      expect(compResult.data).toBeDefined();
      expect(compResult.data!.length).toBeGreaterThan(0);
      const firstDep = (compResult.data as any)[0];
      expect(firstDep.count).toBeGreaterThanOrEqual(3);
      expect(firstDep.weight).toBeGreaterThanOrEqual(0.15);

      // 4b. Verify file-level CO_CHANGES edges
      const coChangeResult = await client.roQuery(
        workspaceId,
        `MATCH (a:File)-[r:CO_CHANGES]->(b:File)
         RETURN a.path AS src, b.path AS target, r.weight AS weight, r.count AS count`
      );
      expect(coChangeResult.data!.length).toBeGreaterThan(0);
      const firstCo = (coChangeResult.data as any)[0];
      expect(firstCo.count).toBeGreaterThanOrEqual(3);
      expect(firstCo.weight).toBeGreaterThanOrEqual(0.15);

      // 5. Verify Git Revert relationship
      const revertResult = await client.roQuery(
        workspaceId,
        `MATCH (pr1:PullRequest)-[:REVERTS]->(pr2:PullRequest)
         RETURN pr1.id AS rev, pr2.id AS orig`
      );
      expect(revertResult.data).toHaveLength(1);

      // 6. Verify Supersession and Temporal Validity
      const supersedesResult = await client.roQuery(
        workspaceId,
        `MATCH (d2:Decision)-[:SUPERSEDES]->(d1:Decision)
         RETURN d1.id AS d1_id, d1.status AS d1_status, d1.valid_to AS d1_valid_to,
                d2.id AS d2_id, d2.status AS d2_status, d2.valid_from AS d2_valid_from`
      );
      expect(supersedesResult.data).toHaveLength(1);
      const s = (supersedesResult.data as any)[0];
      expect(s.d1_status).toBe('superseded');
      expect(s.d2_status).toBe('accepted');
      expect(s.d1_valid_to).toBe(s.d2_valid_from);

      // 6b. Every mined decision must govern a component (briefings' constraining-decisions query joins on this)
      const governsResult = await client.roQuery(
        workspaceId,
        `MATCH (d:Decision) OPTIONAL MATCH (d)-[g:GOVERNS]->(:Component)
         RETURN count(DISTINCT d) AS decisions, count(DISTINCT CASE WHEN g IS NOT NULL THEN d END) AS governing`
      );
      const gov = (governsResult.data as any)[0];
      expect(Number(gov.decisions)).toBeGreaterThan(0);
      expect(Number(gov.governing)).toBe(Number(gov.decisions));

      // 7. Verify Decision Vector Index & Embeddings
      const embedResult = await client.roQuery(
        workspaceId,
        `MATCH (d:Decision) WHERE d.embedding IS NOT NULL RETURN d.id AS id, d.embedding AS emb LIMIT 1`
      );
      expect(embedResult.data).toBeDefined();
      expect(embedResult.data!.length).toBeGreaterThan(0);
      const vector = (embedResult.data as any)[0].emb;
      expect(vector).toHaveLength(512);

      // 8. Verify Phase 1 Named Query Compatibility: who_knows
      const whoKnowsRes = await whoKnows(client, workspaceId, {
        components: ['packages/core'],
      });
      expect(whoKnowsRes.raw.length).toBeGreaterThan(0);
      const aliceRecord = whoKnowsRes.raw.find((r) => r.authorName === 'Alice C');
      expect(aliceRecord).toBeDefined();
      expect(aliceRecord?.authoredCount).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  }, 120000);
  });
});

