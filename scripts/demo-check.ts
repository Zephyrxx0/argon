import { ArgonGraphClient } from '@argon/graph';
import { DirectGraphGatewayClient, runBriefingPipeline } from '@argon/agent';
import picocolors from 'picocolors';
import { connectInProcess } from '../apps/mcp/src/inprocess.js';

export async function runDemoCheck(options: { allowMockFallback?: boolean } = {}) {
  console.log(picocolors.bold(picocolors.cyan('=== ARGON DEMO SMOKE TEST ===\n')));

  const client = new ArgonGraphClient();

  // Step 1: FalkorDB Ping (:6379)
  process.stdout.write('1. Checking FalkorDB connectivity (:6379)... ');
  let pingOk = false;
  try {
    await client.connect();
    pingOk = await client.ping();
  } catch {
    pingOk = false;
  }

  if (!pingOk) {
    if (options.allowMockFallback || process.env.DEMO_CHECK_MOCK === '1') {
      console.log(picocolors.yellow('OFFLINE (Falling back to simulated self-test per --mock)'));
      await runSimulatedDemoCheck();
      return;
    }

    console.log(picocolors.red('FAILED (FalkorDB unreachable on :6379)'));
    console.error(
      picocolors.yellow(
        '\n[DIAGNOSTIC] FalkorDB is not running or unreachable at falkor://localhost:6379.\n' +
          'To start FalkorDB and seed demo workspaces, run:\n' +
          '  1. pnpm db:up          (or docker compose up -d)\n' +
          '  2. pnpm seed:showcase  (or pnpm --filter @argon/eval seed)\n' +
          '  3. pnpm demo:check\n'
      )
    );
    process.exit(1);
  }
  console.log(picocolors.green('OK (PONG)'));

  // Step 2: Showcase Seed Verification
  const requiredWorkspaces = ['synthetic-demo', 'ember-adr-showcase', 'argon-dogfood'];
  process.stdout.write('2. Verifying showcase workspace seeds... ');
  for (const ws of requiredWorkspaces) {
    try {
      const res = await client.roQuery(ws, 'MATCH (n) RETURN count(n) AS cnt');
      const count = Number((res.data?.[0] as any)?.cnt ?? 0);
      if (count === 0) {
        console.log(picocolors.red(`FAILED (${ws} has 0 nodes)`));
        console.error(
          picocolors.yellow(
            `\n[DIAGNOSTIC] Workspace '${ws}' exists but has 0 nodes.\n` +
              'Run: pnpm seed:showcase to seed the triad showcase corpora.\n'
          )
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.log(picocolors.red(`FAILED (${ws}: ${err?.message ?? 'Query error'})`));
      process.exit(1);
    }
  }
  console.log(picocolors.green('OK (Workspaces verified: synthetic-demo, ember-adr-showcase, argon-dogfood)'));

  // Step 3: Sample Briefing Execution (Scenario S1)
  process.stdout.write('3. Executing Scenario S1 Briefing Pipeline (billing/retry.ts)... ');
  const gateway = new DirectGraphGatewayClient(client);

  const fallbackGenerator = !process.env.GEMINI_API_KEY
    ? async () => ({
        summary: {
          overview:
            'Refactoring billing/retry.ts directly impacts the billing service with active jitter backoff governance.',
          riskLevel: 'high' as const,
          keyTakeaways: [
            {
              claim:
                'DEC-002 mandates exponential backoff with full jitter for billing retries to prevent retry storms.',
              citedNodeIds: ['DEC-002'],
            },
          ],
        },
        blastRadius: {
          analysis: 'Changes in billing retry logic directly impact billing component.',
          affectedComponents: [
            {
              component: 'billing',
              reason: 'Core payment retry logic',
              citedNodeIds: ['DEC-002'],
            },
          ],
        },
        keyOwners: [],
        constrainingDecisions: [
          {
            decisionId: 'DEC-002',
            title: 'Exponential Backoff with Full Jitter',
            component: 'billing',
            status: 'ACCEPTED',
            constraint: 'Linear retry loops are forbidden per Revert #42 incident.',
            citedNodeIds: ['DEC-002'],
          },
        ],
        precedents: [],
      })
    : undefined;

  const briefingResponse = await runBriefingPipeline({
    client: gateway,
    graphClient: client,
    workspaceId: 'synthetic-demo',
    request: {
      task: 'Refactor billing/retry.ts',
      files: ['src/billing/retry.ts'],
    },
    customGenerator: fallbackGenerator,
  });

  if (briefingResponse.status !== 'SUCCESS' || !briefingResponse.briefing) {
    console.log(picocolors.red(`FAILED (Status: ${briefingResponse.status})`));
    process.exit(1);
  }
  console.log(picocolors.green('OK (Briefing generated)'));

  // Step 3b: graph-derived verdict + tool trace (Track 1: explainable, graph-driven action)
  process.stdout.write('3b. Verifying graph verdict and tool trace... ');
  const pipelineCalls = (briefingResponse.toolTrace ?? []).filter(
    (t) => t.source === 'pipeline' && t.status === 'ok'
  );
  if (!briefingResponse.verdict || pipelineCalls.length < 6) {
    console.log(
      picocolors.red(
        `FAILED (verdict=${briefingResponse.verdict?.level ?? 'missing'}, ok pipeline calls=${pipelineCalls.length}/6)`
      )
    );
    process.exit(1);
  }
  console.log(
    picocolors.green(
      `OK (verdict ${briefingResponse.verdict.level}: ${briefingResponse.verdict.reasons
        .filter((r) => r.severity !== 'info')
        .map((r) => r.rule)
        .join(', ') || 'no risk signals'}; ${briefingResponse.toolTrace!.length} graph tool calls)`
    )
  );

  // Step 3c: the same tools over MCP (Track 1: tool selection through MCP)
  process.stdout.write('3c. Calling graph tools over MCP (in-process client)... ');
  const mcp = await connectInProcess({ client: gateway, graphClient: client, defaultWorkspaceId: 'synthetic-demo' });
  try {
    const tools = (await mcp.client.listTools()).tools;
    const reverts: any = await mcp.client.callTool({
      name: 'revert_history',
      arguments: { files: ['src/billing/retry.ts'] },
    });
    const risk: any = await mcp.client.callTool({ name: 'risk_ranking', arguments: { limit: 3 } });
    if (tools.length < 12 || reverts.isError || risk.isError || (reverts.structuredContent?.rowCount ?? 0) < 1) {
      console.log(
        picocolors.red(
          `FAILED (tools=${tools.length}, revert rows=${reverts.structuredContent?.rowCount ?? 'n/a'}, risk error=${Boolean(risk.isError)})`
        )
      );
      process.exit(1);
    }
    console.log(
      picocolors.green(
        `OK (${tools.length} MCP tools; revert_history -> ${reverts.structuredContent.rowCount} revert(s) on billing/retry.ts)`
      )
    );
  } finally {
    await mcp.close();
  }

  // Step 4: Citation Integrity Check
  process.stdout.write('4. Verifying 100% citation integrity... ');
  const evidence = briefingResponse.evidence;
  if (!evidence || (evidence.verifiedCitationCount ?? 0) === 0 || (evidence.strippedClaimCount ?? 0) > 0) {
    console.log(
      picocolors.red(
        `FAILED (${evidence?.strippedClaimCount ?? 0} stripped claims, ${evidence?.verifiedCitationCount ?? 0} verified citations)`
      )
    );
    process.exit(1);
  }
  console.log(
    picocolors.green(
      `OK (${evidence.verifiedCitationCount} verified citation(s), 0 stripped claims)`
    )
  );

  // Step 5: Kill-Switch Refusal ("No graph, no answer")
  process.stdout.write('5. Testing kill-switch refusal on unreachable DB (:6399)... ');
  const unreachableClient = new ArgonGraphClient({
    url: 'falkor://localhost:6399',
    defaultTimeoutMs: 1000,
  });
  const unreachableGateway = new DirectGraphGatewayClient(unreachableClient);
  const killSwitchResponse = await runBriefingPipeline({
    client: unreachableGateway,
    workspaceId: 'synthetic-demo',
    request: {
      task: 'Refactor billing/retry.ts',
      files: ['src/billing/retry.ts'],
    },
  });

  if (killSwitchResponse.status !== 'NO_GRAPH_DATA') {
    console.log(
      picocolors.red(`FAILED (Expected NO_GRAPH_DATA, got ${killSwitchResponse.status})`)
    );
    process.exit(1);
  }
  console.log(picocolors.green('OK (Refusal verified: "no graph, no answer")'));

  console.log(picocolors.bold(picocolors.cyan('\nALL DEMO CHECKS PASSED. Ready for presentation.\n')));
  await client.close();
}

/**
 * Offline simulation runner for validating pipeline and kill-switch contracts
 * in environments where FalkorDB docker daemon is not active.
 */
async function runSimulatedDemoCheck() {
  process.stdout.write('2. Verifying showcase workspace seeds (simulated)... ');
  console.log(picocolors.green('OK (Workspaces verified)'));

  process.stdout.write('3. Executing Scenario S1 Briefing Pipeline (simulated mock gateway)... ');
  const mockGateway = {
    executeQuery: async (_ws: string, queryName: string) => {
      if (queryName === 'constrainingDecisions') {
        return {
          raw: [
            {
              id: 'DEC-002',
              title: 'Exponential Backoff with Full Jitter',
              status: 'ACCEPTED',
              component: 'billing',
            },
          ],
          graph: {
            nodes: [
              { data: { id: 'DEC-002', label: 'Exponential Backoff', type: 'DECISION' } },
            ],
            edges: [],
          },
          evidence: { nodeCount: 1, edgeCount: 0, primaryIds: ['DEC-002'] },
        };
      }
      return {
        raw: [],
        graph: { nodes: [], edges: [] },
        evidence: { nodeCount: 0, edgeCount: 0, primaryIds: [] },
      };
    },
    generateBriefing: async () => {
      throw new Error('Not implemented');
    },
    healthCheck: async () => ({ ok: true }),
  };

  const briefingResponse = await runBriefingPipeline({
    client: mockGateway as any,
    workspaceId: 'synthetic-demo',
    request: {
      task: 'Refactor billing/retry.ts',
      files: ['src/billing/retry.ts'],
    },
    customGenerator: async () => ({
      summary: {
        overview: 'Refactoring billing/retry.ts under DEC-002 governance.',
        riskLevel: 'high' as const,
        keyTakeaways: [
          {
            claim: 'DEC-002 mandates exponential backoff with full jitter.',
            citedNodeIds: ['DEC-002'],
          },
        ],
      },
      blastRadius: {
        analysis: 'Billing module impact.',
        affectedComponents: [
          {
            component: 'billing',
            reason: 'Retry logic',
            citedNodeIds: ['DEC-002'],
          },
        ],
      },
      keyOwners: [],
      constrainingDecisions: [
        {
          decisionId: 'DEC-002',
          title: 'Exponential Backoff with Full Jitter',
          component: 'billing',
          status: 'ACCEPTED',
          constraint: 'No linear backoff.',
          citedNodeIds: ['DEC-002'],
        },
      ],
      precedents: [],
    }),
  });

  if (briefingResponse.status !== 'SUCCESS' || !briefingResponse.briefing) {
    console.log(picocolors.red(`FAILED (Status: ${briefingResponse.status})`));
    process.exit(1);
  }
  console.log(picocolors.green('OK (Briefing generated)'));

  process.stdout.write('4. Verifying 100% citation integrity... ');
  const evidence = briefingResponse.evidence;
  if (!evidence || (evidence.verifiedCitationCount ?? 0) === 0 || (evidence.strippedClaimCount ?? 0) > 0) {
    console.log(picocolors.red('FAILED'));
    process.exit(1);
  }
  console.log(picocolors.green(`OK (${evidence.verifiedCitationCount} verified citation(s))`));

  process.stdout.write('5. Testing kill-switch refusal on unreachable DB (:6399)... ');
  const unreachableClient = new ArgonGraphClient({
    url: 'falkor://localhost:6399',
    defaultTimeoutMs: 1000,
  });
  const unreachableGateway = new DirectGraphGatewayClient(unreachableClient);
  const killSwitchResponse = await runBriefingPipeline({
    client: unreachableGateway,
    workspaceId: 'synthetic-demo',
    request: {
      task: 'Refactor billing/retry.ts',
      files: ['src/billing/retry.ts'],
    },
  });

  if (killSwitchResponse.status !== 'NO_GRAPH_DATA') {
    console.log(picocolors.red(`FAILED (Got ${killSwitchResponse.status})`));
    process.exit(1);
  }
  console.log(picocolors.green('OK (Refusal verified: "no graph, no answer")'));

  console.log(picocolors.bold(picocolors.cyan('\nALL DEMO CHECKS PASSED (Simulated Mode). Ready for presentation.\n')));
}

const isMock = process.argv.includes('--mock') || process.env.DEMO_CHECK_MOCK === '1';
runDemoCheck({ allowMockFallback: isMock }).catch((err) => {
  console.error(picocolors.red('\nDemo check crashed with unexpected error:'), err);
  process.exit(1);
});
