#!/usr/bin/env node
import { runIngestion } from './pipeline.js';

function parseArgs(args: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const repoUrl = (flags.repo as string) || process.argv[2];

  if (!repoUrl || repoUrl.startsWith('--')) {
    console.error('Usage: argon-ingest --repo <url|path> [--workspace <id>] [--depth <num>] [--keep-clone]');
    process.exit(1);
  }

  let workspaceId = (flags.workspace as string) || '';
  if (!workspaceId) {
    // Derive workspace ID from repo name
    const cleaned = repoUrl.replace(/\.git$/, '').split('/').pop() || 'default';
    workspaceId = `ws_${cleaned.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  }

  const depth = flags.depth ? parseInt(flags.depth as string, 10) : undefined;
  const keepClone = Boolean(flags['keep-clone']);

  console.log(`[argon-ingest] Starting ingestion for ${repoUrl} (workspace: ${workspaceId})...`);

  try {
    const summary = await runIngestion({
      repoUrl,
      workspaceId,
      depth,
      keepClone,
    });

    console.log('[argon-ingest] Ingestion completed successfully:');
    console.log(`- Workspace ID:   ${summary.workspaceId}`);
    console.log(`- Job ID:         ${summary.jobId}`);
    console.log(`- Commits:        ${summary.commitCount}`);
    console.log(`- Authors:        ${summary.authorCount}`);
    console.log(`- Files:          ${summary.fileCount}`);
    console.log(`- Components:     ${summary.componentCount}`);
    console.log(`- Decisions:      ${summary.decisionCount}`);
    console.log(`- Reverts:        ${summary.revertCount}`);
    console.log(`- Duration:       ${(summary.durationMs / 1000).toFixed(2)}s`);
  } catch (err) {
    console.error('[argon-ingest] Ingestion failed:', err);
    process.exit(1);
  }
}

main();
