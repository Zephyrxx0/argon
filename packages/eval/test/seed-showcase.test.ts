import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgonGraphClient } from '@argon/graph';
import { seedWorkspace, type SeedData } from '../src/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('showcase seed datasets & fast seeder (D-09, D-10, D-11, T-05-08)', () => {
  const seedsDir = path.resolve(__dirname, '../fixtures/seeds');
  const syntheticPath = path.join(seedsDir, 'synthetic-microservices.json');
  const emberPath = path.join(seedsDir, 'emberjs-rfcs.json');
  const dogfoodPath = path.join(seedsDir, 'argon-dogfood.json');

  describe('schema validation and invariants across triad corpus (offline)', () => {
    it('verifies all 3 showcase seed files exist and are within size bounds (<10MB per D-11)', () => {
      expect(fs.existsSync(syntheticPath)).toBe(true);
      expect(fs.existsSync(emberPath)).toBe(true);
      expect(fs.existsSync(dogfoodPath)).toBe(true);

      const maxBytes = 10 * 1024 * 1024; // 10MB per D-11
      expect(fs.statSync(syntheticPath).size).toBeLessThan(maxBytes);
      expect(fs.statSync(emberPath).size).toBeLessThan(maxBytes);
      expect(fs.statSync(dogfoodPath).size).toBeLessThan(maxBytes);
    });

    it('verifies synthetic-microservices.json conforms to D-09, D-10, D-12', () => {
      const data: SeedData = JSON.parse(fs.readFileSync(syntheticPath, 'utf-8'));
      expect(data.workspaceId).toBe('synthetic-demo');
      expect(data.components.length).toBe(4);
      expect(data.files.length).toBeGreaterThanOrEqual(8);
      expect(data.decisions.length).toBeGreaterThanOrEqual(5);

      for (const dec of data.decisions) {
        expect(Array.isArray(dec.embedding)).toBe(true);
        expect(dec.embedding.length).toBe(512);
        for (const val of dec.embedding) {
          expect(typeof val).toBe('number');
          expect(Number.isNaN(val)).toBe(false);
        }
      }
    });

    it('verifies emberjs-rfcs.json contains 100+ RFCs and 300-500 bounded commits per D-11', () => {
      const data: SeedData = JSON.parse(fs.readFileSync(emberPath, 'utf-8'));
      expect(data.workspaceId).toBe('ember-adr-showcase');

      // 100+ RFCs
      expect(data.decisions.length).toBeGreaterThanOrEqual(100);

      // Bounded commit history (300-500 PRs)
      expect(data.reverts.length).toBeGreaterThanOrEqual(300);
      expect(data.reverts.length).toBeLessThanOrEqual(500);

      // Invariant: all decisions must bundle exactly 512-dimension unit vectors
      for (const dec of data.decisions) {
        expect(Array.isArray(dec.embedding)).toBe(true);
        expect(dec.embedding.length).toBe(512);
        for (const val of dec.embedding) {
          expect(typeof val).toBe('number');
          expect(Number.isNaN(val)).toBe(false);
        }
        const norm = Math.hypot(...dec.embedding);
        expect(norm).toBeGreaterThan(0.99);
        expect(norm).toBeLessThan(1.01);
      }

      // Invariant: historical supersession chains exist
      const rfc0496 = data.decisions.find((d) => d.id === 'RFC-0496');
      const rfc0278 = data.decisions.find((d) => d.id === 'RFC-0278');
      expect(rfc0496?.supersedes).toBe('RFC-0278');
      expect(rfc0278?.status).toBe('superseded');

      const rfc0410 = data.decisions.find((d) => d.id === 'RFC-0410');
      const rfc0213 = data.decisions.find((d) => d.id === 'RFC-0213');
      expect(rfc0410?.supersedes).toBe('RFC-0213');
      expect(rfc0213?.status).toBe('superseded');

      const rfc0391 = data.decisions.find((d) => d.id === 'RFC-0391');
      const rfc0095 = data.decisions.find((d) => d.id === 'RFC-0095');
      expect(rfc0391?.supersedes).toBe('RFC-0095');
      expect(rfc0095?.status).toBe('superseded');
    });

    it('verifies argon-dogfood.json contains monorepo architecture and 6 dogfood ADRs per D-09', () => {
      const data: SeedData = JSON.parse(fs.readFileSync(dogfoodPath, 'utf-8'));
      expect(data.workspaceId).toBe('argon-dogfood');
      expect(data.components.length).toBeGreaterThanOrEqual(5);
      expect(data.decisions.length).toBe(6);

      const adrIds = data.decisions.map((d) => d.id);
      expect(adrIds).toEqual([
        'ADR-001',
        'ADR-002',
        'ADR-003',
        'ADR-004',
        'ADR-005',
        'ADR-006',
      ]);

      for (const dec of data.decisions) {
        expect(Array.isArray(dec.embedding)).toBe(true);
        expect(dec.embedding.length).toBe(512);
        for (const val of dec.embedding) {
          expect(typeof val).toBe('number');
          expect(Number.isNaN(val)).toBe(false);
        }
      }

      expect(data.persons).toBeDefined();
      expect(data.persons!.length).toBeGreaterThanOrEqual(3);
      expect(data.dependsOn).toBeDefined();
      expect(data.dependsOn!.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('integration tests with live FalkorDB (gated)', () => {
    let client: ArgonGraphClient | null = null;
    let isFalkorLive = false;

    beforeAll(async () => {
      try {
        client = new ArgonGraphClient({ defaultTimeoutMs: 2000 });
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

    it('seeds ember-adr-showcase in under 5 seconds per D-10', async () => {
      if (!isFalkorLive || !client) {
        console.log('Skipping live FalkorDB showcase test: FalkorDB is offline.');
        return;
      }

      const start = Date.now();
      const result = await seedWorkspace(client, emberPath);
      const durationMs = Date.now() - start;

      expect(result.workspaceId).toBe('ember-adr-showcase');
      expect(result.nodeCount).toBeGreaterThan(100);
      expect(durationMs).toBeLessThan(5000); // Conforming to D-10 (< 5 seconds)

      // Verify vector query against Ember RFCs
      const vecRes = await client.roQuery(
        'ember-adr-showcase',
        `CALL db.idx.vector.queryNodes('Decision', 'embedding', 3, vecf32($vec))
         YIELD node, score
         RETURN node.id AS id, score`,
        { vec: new Array(512).fill(0.04) }
      );
      expect(vecRes.data?.length).toBeGreaterThan(0);
    });
  });
});
