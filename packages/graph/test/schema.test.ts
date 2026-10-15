import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ArgonGraphClient, FalkorUnavailableError } from '../src/client';
import { initWorkspaceGraph } from '../src/schema/init';

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

describe('FalkorDB Schema & Client Integration', () => {
  describe('Offline & "No graph, no answer" refusal invariants', () => {
    it('throws FalkorUnavailableError when accessing raw client or graph without connecting', () => {
      const client = new ArgonGraphClient();
      expect(() => client.getRawClient()).toThrow(FalkorUnavailableError);
      expect(() => client.selectGraph('any_workspace')).toThrow(FalkorUnavailableError);
      expect(() => client.getRawClient()).toThrow('[NO GRAPH, NO ANSWER] FalkorDB is unavailable: Client not connected');
    });

    it('throws FalkorUnavailableError with "[NO GRAPH, NO ANSWER]" when connecting to unreachable host', async () => {
      const unreachableClient = new ArgonGraphClient({
        url: 'falkor://localhost:9999',
        defaultTimeoutMs: 500,
      });

      await expect(unreachableClient.connect()).rejects.toThrow(FalkorUnavailableError);
      await expect(unreachableClient.connect()).rejects.toThrow(/\[NO GRAPH, NO ANSWER\] FalkorDB is unavailable/);
    });

    it('rejects roQuery on unconnected client with FalkorUnavailableError', async () => {
      const client = new ArgonGraphClient();
      await expect(client.roQuery('test_ws', 'RETURN 1')).rejects.toThrow(FalkorUnavailableError);
    });
  });

  describe.skipIf(!isFalkorLive)('Live FalkorDB instance operations', () => {
    const testWorkspace = `test_schema_${Date.now()}`;
    let liveClient: ArgonGraphClient;

    beforeAll(async () => {
      liveClient = new ArgonGraphClient();
      await liveClient.connect();
    });

    afterAll(async () => {
      if (liveClient) {
        try {
          const graph = liveClient.selectGraph(testWorkspace);
          await graph.delete();
        } catch {
          // ignore cleanup errors
        }
        await liveClient.close();
      }
    });

    it('verifies live client connectivity and ping() returns true', async () => {
      const isHealthy = await liveClient.ping();
      expect(isHealthy).toBe(true);
    });

    it('applies schema idempotently on first and second execution', async () => {
      // First execution: initializes range indexes, constraints, and 512-d vector index
      await expect(initWorkspaceGraph(liveClient, testWorkspace)).resolves.not.toThrow();

      // Second execution: must not throw on pre-existing indexes or constraints
      await expect(initWorkspaceGraph(liveClient, testWorkspace)).resolves.not.toThrow();
    });

    it('verifies 512-d vector index by creating and querying a Decision node', async () => {
      const graph = liveClient.selectGraph(testWorkspace);
      const dummyVector = new Array(512).fill(0.044194); // normalized unit vector ~ 1/sqrt(512)

      // Insert Decision node with 512-d embedding
      await graph.query(
        `CREATE (d:Decision {
          id: 'DEC-001',
          title: 'Adopt FalkorDB',
          status: 'accepted',
          valid_from: 1700000000000,
          embedding: vecf32($vec),
          embedding_model: 'onnx-community/embeddinggemma-2-ONNX'
        })`,
        { params: { vec: dummyVector } }
      );

      // Query vector index
      const result = await graph.query(
        `CALL db.idx.vector.queryNodes('Decision', 'embedding', 1, vecf32($queryVector))
         YIELD node, score
         RETURN node.id AS id, node.title AS title, score`,
        { params: { queryVector: dummyVector } }
      );

      expect(result.data).toBeDefined();
      expect(result.data?.length).toBeGreaterThanOrEqual(1);
      const row = result.data?.[0] as any;
      expect(row).toBeDefined();
    });
  });
});
