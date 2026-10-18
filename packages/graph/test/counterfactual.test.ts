import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient } from '../src/client';
import {
  counterfactualImpact,
  CounterfactualImpactParamsSchema,
  CounterfactualImpactResultSchema,
  getCypherQuery,
  toCytoscapeElements,
} from '../src';
import { seedTestGraph } from './seed-fixture';

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

describe('10_counterfactual_impact: contracts (offline)', () => {
  it('validates params and applies defaults', () => {
    expect(() => CounterfactualImpactParamsSchema.parse({ component: '', asOf: 5 })).toThrow();
    expect(() => CounterfactualImpactParamsSchema.parse({ component: 'A', asOf: -1 })).toThrow();
    expect(() => CounterfactualImpactParamsSchema.parse({ component: 'A', asOf: 5, maxDepth: 6 })).toThrow();
    expect(() => CounterfactualImpactParamsSchema.parse({ component: 'A', asOf: 5, limit: 101 })).toThrow();
    const ok = CounterfactualImpactParamsSchema.parse({ component: 'A', asOf: 5 });
    expect(ok.maxDepth).toBe(3);
    expect(ok.limit).toBe(25);
  });

  it('is a read-only, parameterized query', () => {
    const q = getCypherQuery('10_counterfactual_impact.cypher');
    expect(q).toContain('algo.pageRank');
    expect(q).toContain('$component');
    expect(q).toContain('$asOf');
    // same temporal predicate as query 05
    expect(q).toContain('d.valid_from <= $asOf AND (d.valid_to IS NULL OR d.valid_to > $asOf)');
    expect(q).not.toMatch(/\b(CREATE|MERGE|DELETE|SET|REMOVE)\b/);
  });

  it('rejects a malformed row (unknown direction)', () => {
    expect(() =>
      CounterfactualImpactResultSchema.parse([
        { target: 'A', component: 'B', direction: 'SIDEWAYS', hops: 1, score: 0.1, decisions: [], owners: [] },
      ])
    ).toThrow();
  });

  it('transforms a row into a mini graph and exposes decisions and owners as citable ids', () => {
    const row = {
      target: 'Storage',
      component: 'Database',
      direction: 'DEPENDENT',
      hops: 1,
      score: 0.2,
      decisions: [{ id: 'D-9', title: 'Pool size', status: 'active' }],
      owners: [
        { id: '@org/data', name: 'data', pattern: '/src/db/' },
        { id: 'p-1', name: 'Pat', pattern: '/src/db/' },
      ],
    };
    const p = toCytoscapeElements([row]);
    expect(p.evidence.primaryIds).toEqual(expect.arrayContaining(['Database', 'D-9', '@org/data', 'p-1']));
    const types = Object.fromEntries(p.graph.nodes.map((n) => [n.data.id, n.data.type]));
    expect(types).toMatchObject({ Database: 'Component', Storage: 'Component', 'D-9': 'Decision', '@org/data': 'Team', 'p-1': 'Person' });
    const edges = p.graph.edges.map((e) => `${e.data.source}-${e.data.label}->${e.data.target}`);
    // a DEPENDENT depends on the target: Database -> Storage
    expect(edges).toContain('Database-DEPENDS_ON->Storage');
    expect(edges).toContain('D-9-GOVERNS->Database');
    expect(edges).toContain('@org/data-OWNS->Database');
  });

  it('draws DEPENDENCY rows the other way round and only the first hop as an edge', () => {
    const base = { target: 'Auth', score: 0.1, decisions: [], owners: [] };
    const near = toCytoscapeElements([{ ...base, component: 'Database', direction: 'DEPENDENCY', hops: 1 }]);
    expect(near.graph.edges.map((e) => `${e.data.source}->${e.data.target}`)).toEqual(['Auth->Database']);
    const far = toCytoscapeElements([{ ...base, component: 'Storage', direction: 'DEPENDENCY', hops: 2 }]);
    expect(far.graph.edges).toHaveLength(0);
  });
});

describe.skipIf(!isFalkorLive)('10_counterfactual_impact: live FalkorDB', () => {
  const ws = `test_counterfactual_${Date.now()}`;
  let client: ArgonGraphClient;
  const NOW = 5000;

  const nodeCount = async () => Number(((await client.roQuery(ws, 'MATCH (n) RETURN count(n) AS c')).data?.[0] as any).c);

  beforeAll(async () => {
    client = new ArgonGraphClient();
    await client.connect();
    // Auth -> Database -> Storage, plus Gateway -> Auth and Cache -> Database
    await seedTestGraph(client, ws);
    await client.query(
      ws,
      `MATCH (auth:Component {name: 'Auth'}), (db:Component {name: 'Database'}), (st:Component {name: 'Storage'})
       CREATE (gw:Component {name: 'Gateway'})
       CREATE (cache:Component {name: 'Cache'})
       CREATE (gw)-[:DEPENDS_ON]->(auth)
       CREATE (cache)-[:DEPENDS_ON]->(db)
       CREATE (dbDec:Decision {id: 'D-DB', title: 'Pool connections', status: 'accepted', valid_from: 100})
       CREATE (dbOld:Decision {id: 'D-DB-OLD', title: 'One connection per request', status: 'superseded', valid_from: 10, valid_to: 100})
       CREATE (dbDec)-[:GOVERNS]->(db)
       CREATE (dbOld)-[:GOVERNS]->(db)
       CREATE (team:Team {id: '@org/data', name: 'data'})
       CREATE (team)-[:OWNS {pattern: '/src/db/', coverage: 1.0}]->(db)`
    );
  });

  afterAll(async () => {
    if (client) {
      try {
        await client.selectGraph(ws).delete();
      } catch {
        // ignore cleanup errors
      }
      await client.close();
    }
  });

  it('changing Storage disturbs its dependents, nearest first, then by PageRank', async () => {
    const res = await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW });
    const rows = res.raw.map((r) => `${r.component}:${r.direction}:${r.hops}`);
    // hop 1: Database; hop 2: Auth and Cache (Auth is pointed at by Gateway so it ranks higher); hop 3: Gateway
    expect(rows).toEqual([
      'Database:DEPENDENT:1',
      'Auth:DEPENDENT:2',
      'Cache:DEPENDENT:2',
      'Gateway:DEPENDENT:3',
    ]);
    const auth = res.raw.find((r) => r.component === 'Auth')!;
    const cache = res.raw.find((r) => r.component === 'Cache')!;
    expect(auth.score!).toBeGreaterThan(cache.score!);
    expect(res.raw.every((r) => r.target === 'Storage')).toBe(true);
    // the changed component never lists itself
    expect(res.raw.some((r) => r.component === 'Storage')).toBe(false);
  });

  it('returns the in-force decisions and the owner of record of each affected component', async () => {
    const res = await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW });
    const db = res.raw.find((r) => r.component === 'Database')!;
    // D-DB is in force at NOW; D-DB-OLD (valid_to 100) is not
    expect(db.decisions.map((d) => d.id)).toEqual(['D-DB']);
    expect(db.owners).toEqual([{ id: '@org/data', name: 'data', pattern: '/src/db/' }]);

    const auth = res.raw.find((r) => r.component === 'Auth')!;
    expect(auth.decisions.map((d) => d.id)).toEqual(['D-02']); // D-01 is superseded at NOW
    expect(auth.owners).toEqual([]);

    // evidence: affected components, decisions and owners are all citable
    expect(res.evidence.primaryIds).toEqual(expect.arrayContaining(['Database', 'Auth', 'D-DB', 'D-02', '@org/data']));
  });

  it('evaluates decision validity at asOf (time travel)', async () => {
    // asOf 50: only the old Database decision is in force, nothing governs Auth yet
    const early = await counterfactualImpact(client, ws, { component: 'Storage', asOf: 50 });
    expect(early.raw.find((r) => r.component === 'Database')!.decisions.map((d) => d.id)).toEqual(['D-DB-OLD']);
    expect(early.raw.find((r) => r.component === 'Auth')!.decisions).toEqual([]);

    // asOf 1500: D-01 (1000..2000) governs Auth and the pooled-connections decision replaced D-DB-OLD
    const mid = await counterfactualImpact(client, ws, { component: 'Storage', asOf: 1500 });
    expect(mid.raw.find((r) => r.component === 'Auth')!.decisions.map((d) => d.id)).toEqual(['D-01']);
    expect(mid.raw.find((r) => r.component === 'Database')!.decisions.map((d) => d.id)).toEqual(['D-DB']);
  });

  it('reports both directions for a middle component', async () => {
    const res = await counterfactualImpact(client, ws, { component: 'Database', asOf: NOW });
    const byDirection = (d: string) => res.raw.filter((r) => r.direction === d).map((r) => `${r.component}:${r.hops}`).sort();
    expect(byDirection('DEPENDENT')).toEqual(['Auth:1', 'Cache:1', 'Gateway:2']);
    expect(byDirection('DEPENDENCY')).toEqual(['Storage:1']);
  });

  it('respects maxDepth and limit', async () => {
    const shallow = await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW, maxDepth: 1 });
    expect(shallow.raw.map((r) => r.component)).toEqual(['Database']);
    const limited = await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW, limit: 2 });
    expect(limited.raw.map((r) => r.component)).toEqual(['Database', 'Auth']);
  });

  it('mutation check: removing a DEPENDS_ON edge removes the rows it justified', async () => {
    await client.query(ws, `MATCH (:Component {name: 'Database'})-[r:DEPENDS_ON]->(:Component {name: 'Storage'}) DELETE r`);
    try {
      const res = await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW });
      expect(res.raw).toEqual([]);
    } finally {
      await client.query(
        ws,
        `MATCH (a:Component {name: 'Database'}), (b:Component {name: 'Storage'}) CREATE (a)-[:DEPENDS_ON]->(b)`
      );
    }
    const restored = await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW });
    expect(restored.raw.length).toBe(4);
  });

  it('an unknown component yields no rows (not an error)', async () => {
    const res = await counterfactualImpact(client, ws, { component: 'does-not-exist', asOf: NOW });
    expect(res.raw).toEqual([]);
    expect(res.evidence.primaryIds).toEqual([]);
  });

  it('terminates on dependency cycles and never lists the changed component', async () => {
    await client.query(
      ws,
      `MATCH (a:Component {name: 'Storage'}), (b:Component {name: 'Auth'}) CREATE (a)-[:DEPENDS_ON]->(b)`
    );
    try {
      const res = await counterfactualImpact(client, ws, { component: 'Auth', asOf: NOW, maxDepth: 5 });
      expect(res.raw.some((r) => r.component === 'Auth')).toBe(false);
      expect(res.raw.length).toBeGreaterThan(0);
    } finally {
      await client.query(ws, `MATCH (:Component {name: 'Storage'})-[r:DEPENDS_ON]->(:Component {name: 'Auth'}) DELETE r`);
    }
  });

  it('is read-only: the graph is unchanged by the call', async () => {
    const before = await nodeCount();
    await counterfactualImpact(client, ws, { component: 'Storage', asOf: NOW });
    expect(await nodeCount()).toBe(before);
  });
});
