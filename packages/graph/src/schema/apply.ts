import { ArgonGraphClient } from '../client';
import { initWorkspaceGraph } from './init';

async function main() {
  const workspaceId = process.argv[2] || process.env.ARGON_WORKSPACE_ID || 'default-workspace';
  console.log(`[schema:apply] Initializing schema for workspace "${workspaceId}"...`);

  const client = new ArgonGraphClient();
  try {
    await client.connect();
    await initWorkspaceGraph(client, workspaceId);
    console.log(`[schema:apply] Successfully initialized schema and vector indexes for workspace "${workspaceId}".`);
  } catch (error) {
    console.error(`[schema:apply] Failed to initialize schema for workspace "${workspaceId}":`, error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (require.main === module || process.argv[1]?.endsWith('apply.ts')) {
  main();
}
