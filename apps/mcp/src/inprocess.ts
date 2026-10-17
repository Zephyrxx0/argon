import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createArgonMcpServer, type ArgonMcpServerOptions } from './server.js';

/**
 * Connects a real MCP client to an Argon MCP server inside the current process (in-memory
 * transport). Handy for smoke tests and demos: every call is a genuine MCP request/response.
 */
export async function connectInProcess(options: ArgonMcpServerOptions): Promise<{
  client: Client;
  close(): Promise<void>;
}> {
  const server = createArgonMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'argon-in-process', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
