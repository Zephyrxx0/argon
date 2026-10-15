import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonGraphClient } from '@argon/graph';
import { seedWorkspace, type SeedData } from '../src/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('synthetic-microservices seed data & seeder', () => {
  const seedPath = path.resolve(__dirname, '../fixtures/seeds/synthetic-microservices.json');

  describe('unit tests (offline)', () => {
    it('loads synthetic-microservices.json and validates complete structure conforming to D-12', () => {
      expect(fs.existsSync(seedPath)).toBe(true);
      const raw = fs.readFileSync(seedPath, 'utf-8');
      const data: SeedData = JSON.parse(raw);

      expect(data.workspaceId).toBe('synthetic-demo');
      expect(data.components.length).toBe(4);
      expect(data.files.length).toBeGreaterThanOrEqual(8);
      expect(data.decisions.length).toBeGreaterThanOrEqual(5);

      const componentNames = data.components.map((c) => c.name);
      expect(componentNames).toContain('billing');
      expect(componentNames).toContain('auth');
      expect(componentNames).toContain('sync');
      expect(componentNames).toContain('api-gateway');

      // DEC-001 & DEC-002 supersession chain
      const dec001 = data.decisions.find((d) => d.id === 'DEC-001');
      const dec002 = data.decisions.find((d) => d.id === 'DEC-002');
      expect(dec001).toBeDefined();
      expect(dec002).toBeDefined();
      expect(dec001?.status).toBe('superseded');
      expect(dec001?.valid_to).toBe(1685577600);
      expect(dec002?.status).toBe('active');
      expect(dec002?.supersedes).toBe('DEC-001');
      expect(dec002?.valid_from).toBe(1685577600);
      expect(dec002?.valid_to).toBeNull();

      // All decisions must have 512-dimension unit vectors
      for (const d of data.decisions) {
        expect(Array.isArray(d.embedding)).toBe(true);
        expect(d.embedding.length).toBe(512);
        for (const num of d.embedding) {
          expect(typeof num).toBe('number');
          expect(Number.isNaN(num)).toBe(false);
        }
        const norm = Math.hypot(...d.embedding);
        expect(norm).toBeGreaterThan(0.99);
        expect(norm).toBeLessThan(1.01);
      }

      // Revert #42
      const rev42 = data.reverts.find((r) => r.revertId === 'PR-042');
      expect(rev42).toBeDefined();
      expect(rev42?.summary).toContain('Retry Storm');
      expect(rev42?.timestamp).toBe(1686000000);
      expect(rev42?.files).toContain('src/billing/retry.ts');
    });
  });

  describe('integration tests with FalkorDB (gated)', () => {
    let client: ArgonGraphClient | null = null;
    let isFalkorLive = false;

    beforeAll(async () => {
      try {
        client = new ArgonGraphClient({ defaultTimeoutMs: 1500 });
        await client.connect();
        isFalkorLive = await client.ping();
      } catch {
        isFalkorLive = false;
      }
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it('seeds synthetic-demo into live FalkorDB if available', async () => {
      if (!isFalkorLive || !client) {
        console.log('Skipping live FalkorDB seed test: FalkorDB is offline.');
        return;
      }

      const result = await seedWorkspace(client, seedPath);
      expect(result.workspaceId).toBe('synthetic-demo');
      expect(result.nodeCount).toBeGreaterThan(15);

      // Verify Component count = 4
      const compRes = await client.roQuery(
        'synthetic-demo',
        'MATCH (c:Component) RETURN count(c) AS cnt'
      );
      expect(Number((compRes.data?.[0] as any)?.cnt)).toBe(4);

      // Verify File count >= 8
      const fileRes = await client.roQuery(
        'synthetic-demo',
        'MATCH (f:File) RETURN count(f) AS cnt'
      );
      expect(Number((fileRes.data?.[0] as any)?.cnt)).toBeGreaterThanOrEqual(8);

      // Verify Decision count >= 5
      const decRes = await client.roQuery(
        'synthetic-demo',
        'MATCH (d:Decision) RETURN count(d) AS cnt'
      );
      expect(Number((decRes.data?.[0] as any)?.cnt)).toBeGreaterThanOrEqual(5);

      // Verify [:SUPERSEDES] edge exists between DEC-002 and DEC-001
      const edgeRes = await client.roQuery(
        'synthetic-demo',
        `MATCH (d2:Decision {id: 'DEC-002'})-[:SUPERSEDES]->(d1:Decision {id: 'DEC-001'})
         RETURN count(*) AS cnt`
      );
      expect(Number((edgeRes.data?.[0] as any)?.cnt)).toBe(1);

      // Verify Vector index searchability using vecf32
      const vecRes = await client.roQuery(
        'synthetic-demo',
        `CALL db.idx.vector.queryNodes('Decision', 'embedding', 2, vecf32($vec))
         YIELD node, score
         RETURN node.id AS id, score`,
        { vec: new Array(512).fill(0.04) }
      );
      expect(vecRes.data?.length).toBeGreaterThan(0);
    });
  });
});
