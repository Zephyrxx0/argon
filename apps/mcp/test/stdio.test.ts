import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ArgonGraphClient } from '@argon/graph';
import { isFalkorLive, seedWorkspace, textOf } from './harness.js';

const live = await isFalkorLive();
const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Spawns the real `argon-mcp` binary over stdio, exactly as Claude Code / Cursor would. */
async function spawnServer(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/bin.ts'],
    cwd: pkgDir,
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: 'pipe',
  });
  let stderr = '';
  const client = new Client({ name: 'stdio-test', version: '0.0.0' });
  await client.connect(transport);
  transport.stderr?.on('data', (d) => (stderr += String(d)));
  return { client, getStderr: () => stderr, close: () => client.close() };
}

describe.skipIf(!live)('argon-mcp binary over real stdio', () => {
  const ws = `test_mcp_stdio_${Date.now()}`;
  let graph: ArgonGraphClient;

  beforeAll(async () => {
    graph = new ArgonGraphClient();
    await graph.connect();
    await seedWorkspace(graph, ws);
  });

  afterAll(async () => {
    try {
      await graph.selectGraph(ws).delete();
    } catch {
      // ignore
    }
    await graph.close();
  });

  it('speaks clean MCP on stdout, lists all tools and answers from FalkorDB using the default workspace', async () => {
    const server = await spawnServer({ ARGON_WORKSPACE_ID: ws });
    try {
      const { tools } = await server.client.listTools();
      expect(tools).toHaveLength(13);

      const ranking: any = await server.client.callTool({ name: 'risk_ranking', arguments: { limit: 3 } });
      expect(ranking.isError).toBeFalsy();
      expect(ranking.structuredContent.rows.map((r: any) => r.component)).toEqual(['Storage', 'Database', 'Auth']);

      const path: any = await server.client.callTool({
        name: 'path_between',
        arguments: { sourceName: 'Auth', targetName: 'Storage' },
      });
      expect(path.structuredContent.rows[0].path._path).toEqual(['Auth', 'Database', 'Storage']);

      const reverts: any = await server.client.callTool({
        name: 'revert_history',
        arguments: { files: ['src/auth.ts'], limit: 5 },
      });
      expect(reverts.structuredContent.rows[0].node._id).toBe('pr_rev');

      const workspaces: any = await server.client.callTool({ name: 'list_workspaces', arguments: {} });
      expect(workspaces.structuredContent.workspaces).toContain(ws);
      expect(workspaces.structuredContent.defaultWorkspaceId).toBe(ws);
      expect(server.getStderr()).toContain('[argon-mcp] ready (stdio)');
    } finally {
      await server.close();
    }
  }, 60_000);

  it('exits cleanly (code 0) when the client closes stdin instead of lingering as an orphan', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/bin.ts'], {
      cwd: pkgDir,
      env: { ...process.env, ARGON_WORKSPACE_ID: ws },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server never became ready: ${stderr}`)), 30_000);
      child.stderr.on('data', () => {
        if (stderr.includes('ready (stdio)')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const exit = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    child.stdin.end();
    const code = await Promise.race([
      exit,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10_000)),
    ]);
    if (code === 'timeout') child.kill('SIGKILL');
    expect(code).toBe(0);
  }, 60_000);

  it('stays up and fails closed ("NO GRAPH, NO ANSWER") when FalkorDB is unreachable', async () => {
    const server = await spawnServer({ ARGON_WORKSPACE_ID: ws, FALKORDB_URL: 'falkor://localhost:6399' });
    try {
      const res: any = await server.client.callTool({ name: 'risk_ranking', arguments: { limit: 3 } });
      expect(res.isError).toBe(true);
      expect(textOf(res)).toMatch(/NO GRAPH, NO ANSWER/);
      expect(server.getStderr()).toMatch(/FalkorDB not reachable/);
    } finally {
      await server.close();
    }
  }, 60_000);
});
