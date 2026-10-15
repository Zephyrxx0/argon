#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import picocolors from 'picocolors';
import Table from 'cli-table3';
import { ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient } from '@argon/agent';
import { runGraphBacktest } from './runner/graph-runner.js';
import { seedAllShowcaseWorkspaces } from './seed.js';
import { RevertFixtureItemSchema, type RevertFixtureItem } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('argon-eval')
  .description('Argon Evaluation and Revert Backtest Benchmark CLI')
  .version('0.1.0');

program
  .command('bench:graph')
  .description('Run temporal graph backtest on historical reverts via FalkorDB')
  .option('-w, --workspace <id>', 'Filter by workspace ID')
  .action(async (options: { workspace?: string }) => {
    console.log(picocolors.cyan('\n=== ARGON TEMPORAL GRAPH BACKTEST (FalkorDB) ===\n'));

    const fixturePath = path.resolve(__dirname, '../fixtures/reverts.json');
    if (!fs.existsSync(fixturePath)) {
      console.error(picocolors.red(`Error: Fixture file not found at ${fixturePath}`));
      process.exit(1);
    }

    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const allFixtures: RevertFixtureItem[] = JSON.parse(raw).map((f: unknown) =>
      RevertFixtureItemSchema.parse(f)
    );

    const fixtures = options.workspace
      ? allFixtures.filter((f) => f.workspaceId === options.workspace)
      : allFixtures;

    if (fixtures.length === 0) {
      console.log(picocolors.yellow(`No fixtures found matching workspace: ${options.workspace}`));
      process.exit(0);
    }

    console.log(
      picocolors.dim(`Loaded ${fixtures.length} fixture(s) across workspaces: ${
        Array.from(new Set(fixtures.map((f) => f.workspaceId))).join(', ')
      }`)
    );

    const client = new ArgonGraphClient();
    try {
      await client.connect();
      const isLive = await client.ping();
      if (!isLive) {
        throw new Error('FalkorDB ping returned false');
      }
    } catch (err: any) {
      console.error(picocolors.red(`\nFailed to connect to FalkorDB: ${err?.message ?? err}`));
      console.error(picocolors.yellow('Ensure FalkorDB is running (e.g. docker compose up -d)\n'));
      process.exit(1);
    }

    const gateway = new DirectGraphGatewayClient(client);

    try {
      const { summary } = await runGraphBacktest(gateway, fixtures);

      const table = new Table({
        head: [
          picocolors.cyan('Metric'),
          picocolors.green('Argon (FalkorDB Graph)'),
        ],
        style: { head: [], border: [] },
      });

      table.push(
        ['Total Cases', String(summary.totalCases)],
        ['Recall@1', `${(summary.recallAt1 * 100).toFixed(1)}%`],
        ['Recall@3', `${(summary.recallAt3 * 100).toFixed(1)}%`],
        ['Recall@5', `${(summary.recallAt5 * 100).toFixed(1)}%`],
        ['MRR', summary.mrr.toFixed(3)],
        [
          'Superseded Hallucination Rate',
          summary.supersededRate === 0
            ? picocolors.green('0.0% (Clean)')
            : picocolors.red(`${(summary.supersededRate * 100).toFixed(1)}%`),
        ],
        ['Avg Query Latency', `${summary.avgLatencyMs}ms`]
      );

      console.log(table.toString());
      console.log(picocolors.green('\nTemporal graph backtest completed successfully.\n'));
    } finally {
      await client.close();
    }
  });

program
  .command('seed')
  .description('Seed all curated showcase workspaces into FalkorDB')
  .option('-d, --dir <path>', 'Custom seeds directory')
  .action(async (options: { dir?: string }) => {
    console.log(picocolors.cyan('\n=== ARGON SHOWCASE CORPUS SEEDER ===\n'));

    const client = new ArgonGraphClient();
    try {
      await client.connect();
      const isLive = await client.ping();
      if (!isLive) {
        throw new Error('FalkorDB ping returned false');
      }
    } catch (err: any) {
      console.error(picocolors.red(`\nFailed to connect to FalkorDB: ${err?.message ?? err}`));
      console.error(picocolors.yellow('Ensure FalkorDB is running (e.g. docker compose up -d)\n'));
      process.exit(1);
    }

    const startTime = Date.now();
    try {
      const summary = await seedAllShowcaseWorkspaces(client, options.dir);
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

      const table = new Table({
        head: [
          picocolors.cyan('Workspace'),
          picocolors.green('Nodes Seeded'),
          picocolors.yellow('Status'),
        ],
        style: { head: [], border: [] },
      });

      for (const [ws, count] of Object.entries(summary)) {
        table.push([ws, String(count), picocolors.green('SUCCESS')]);
      }

      console.log(table.toString());
      console.log(picocolors.green(`\nShowcase seeding finished in ${totalTime}s.\n`));
    } catch (err: any) {
      console.error(picocolors.red(`\nSeeding failed: ${err?.message ?? err}`));
      process.exit(1);
    } finally {
      await client.close();
    }
  });

program.parse(process.argv);
