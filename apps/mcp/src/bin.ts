#!/usr/bin/env -S npx tsx
/**
 * Argon MCP server over stdio, for Claude Code, Cursor and any other MCP client.
 *
 * IMPORTANT: stdout carries the protocol. Everything human-readable goes to stderr.
 *
 * Env: FALKORDB_URL (default falkor://localhost:6379), ARGON_WORKSPACE_ID (default workspace),
 *      GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY (only for generate_briefing and the
 *      precedent_search embeddings when EMBEDDING_PROVIDER=gemini).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ArgonEmbedder, ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient } from '@argon/agent';
import { createArgonMcpServer } from './server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

const log = (msg: string) => process.stderr.write(`[argon-mcp] ${msg}\n`);

async function main() {
  const graphClient = new ArgonGraphClient();
  try {
    await graphClient.connect();
    log(`connected to FalkorDB at ${graphClient.url}`);
  } catch (err: any) {
    // Stay up: every tool call will report "NO GRAPH, NO ANSWER" until FalkorDB is reachable.
    log(`FalkorDB not reachable yet (${err?.message}); tools will fail closed until it is`);
  }

  const ensureConnected = async () => {
    if (await graphClient.ping()) return;
    await graphClient.connect();
  };

  const server = createArgonMcpServer({
    client: new DirectGraphGatewayClient(graphClient),
    graphClient,
    embedder: new ArgonEmbedder(),
    defaultWorkspaceId: process.env.ARGON_WORKSPACE_ID || undefined,
    ensureConnected,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('ready (stdio)');

  const shutdown = async () => {
    await server.close().catch(() => {});
    await graphClient.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // MCP clients end the session by closing our stdin; do not linger as an orphan process.
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
}

main().catch((err) => {
  log(`fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
