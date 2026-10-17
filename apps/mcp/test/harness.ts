import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ArgonGraphClient, initWorkspaceGraph } from '@argon/graph';
import { DirectGraphGatewayClient } from '@argon/agent';
import { createArgonMcpServer, type ArgonMcpServerOptions } from '../src/server.js';

export const VEC_AUTH_OLD: number[] = new Array(512).fill(0);
VEC_AUTH_OLD[0] = 1;
export const VEC_AUTH_NEW: number[] = new Array(512).fill(0);
VEC_AUTH_NEW[1] = 1;

/** Deterministic embedder: every text maps to the "old auth decision" vector. */
export const fakeEmbedder = {
  embed: async (_text: string, _isQuery?: boolean) => ({ vector: VEC_AUTH_OLD }),
};

export async function isFalkorLive(): Promise<boolean> {
  try {
    const probe = new ArgonGraphClient({ defaultTimeoutMs: 1000 });
    await probe.connect();
    const ok = await probe.ping();
    await probe.close();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Small deterministic graph:
 *   Auth -DEPENDS_ON-> Database -DEPENDS_ON-> Storage
 *   D-01 (superseded, 1000..2000) and D-02 (active from 2001, SUPERSEDES D-01) govern Auth
 *   pr_orig (Alice) touched src/auth.ts, pr_rev reverted it
 */
export async function seedWorkspace(client: ArgonGraphClient, workspaceId: string): Promise<void> {
  try {
    await client.query(workspaceId, 'MATCH (n) DETACH DELETE n');
  } catch {
    // graph did not exist yet
  }
  await initWorkspaceGraph(client, workspaceId);
  await client.query(
    workspaceId,
    `CREATE (f1:File {path: 'src/auth.ts'})
     CREATE (f2:File {path: 'src/session.ts'})
     CREATE (f3:File {path: 'src/db.ts'})
     CREATE (f4:File {path: 'src/store.ts'})
     CREATE (c1:Component {name: 'Auth'})
     CREATE (c2:Component {name: 'Database'})
     CREATE (c3:Component {name: 'Storage'})
     CREATE (f1)-[:IN_COMPONENT]->(c1)
     CREATE (f2)-[:IN_COMPONENT]->(c1)
     CREATE (f3)-[:IN_COMPONENT]->(c2)
     CREATE (f4)-[:IN_COMPONENT]->(c3)
     CREATE (c1)-[:DEPENDS_ON]->(c2)
     CREATE (c2)-[:DEPENDS_ON]->(c3)
     CREATE (d1:Decision {id: 'D-01', title: 'JWT Auth', status: 'superseded', valid_from: 1000, valid_to: 2000,
       embedding: vecf32($vec1), source_url: 'docs/adr/001-jwt.md'})
     CREATE (d2:Decision {id: 'D-02', title: 'Session Cookies', status: 'active', valid_from: 2001,
       embedding: vecf32($vec2), source_url: 'docs/adr/002-sessions.md'})
     CREATE (d1)-[:GOVERNS]->(c1)
     CREATE (d2)-[:GOVERNS]->(c1)
     CREATE (d2)-[:SUPERSEDES]->(d1)
     CREATE (alice:Person {id: 'alice_hash', display_name: 'Alice'})
     CREATE (orig:PullRequest {id: 'pr_orig', title: 'Extend JWT lifetime', merged_at: 1500, is_revert: false})
     CREATE (rev:PullRequest {id: 'pr_rev', title: 'Revert: Extend JWT lifetime', merged_at: 1600, is_revert: true})
     CREATE (alice)-[:AUTHORED]->(orig)
     CREATE (orig)-[:TOUCHES]->(f1)
     CREATE (rev)-[:TOUCHES]->(f1)
     CREATE (rev)-[:REVERTS]->(orig)`,
    { vec1: VEC_AUTH_OLD, vec2: VEC_AUTH_NEW }
  );
}

export interface Connected {
  client: Client;
  close(): Promise<void>;
}

/** Connects a real MCP Client to the Argon server over an in-memory transport pair. */
export async function connectInMemory(
  options: ArgonMcpServerOptions
): Promise<Connected & { server: ReturnType<typeof createArgonMcpServer> }> {
  const server = createArgonMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'argon-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function directOptions(graphClient: ArgonGraphClient, extra: Partial<ArgonMcpServerOptions> = {}): ArgonMcpServerOptions {
  return {
    client: new DirectGraphGatewayClient(graphClient),
    graphClient,
    embedder: fakeEmbedder,
    ...extra,
  };
}

export function textOf(res: any): string {
  return (res.content as any[]).map((c) => (c.type === 'text' ? c.text : '')).join('');
}
