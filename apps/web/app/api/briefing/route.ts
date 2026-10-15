import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { GatewayClient } from '@argon/agent';

export const dynamic = 'force-dynamic';

const BriefingRequestSchema = z.object({
  task: z.string().min(1, 'Task description cannot be empty'),
  workspaceId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid workspaceId format')
    .default('ember-adr-showcase'),
  files: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
  contributorId: z.string().optional().nullable(),
  asOf: z.number().optional(),
  anonymousSessionId: z.string().optional(),
});

export type BriefingRequestBody = z.infer<typeof BriefingRequestSchema>;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = BriefingRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid briefing request payload',
          issues: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { task, workspaceId, files, components, contributorId, asOf, anonymousSessionId } =
      parseResult.data;

    const { ArgonGraphClient } = await import('@argon/graph');
    const { HttpGatewayClient, DirectGraphGatewayClient, runBriefingPipeline } = await import(
      '@argon/agent'
    );

    const graphClient = new ArgonGraphClient();

    // Client auto-selection conforming to D-12
    let client: GatewayClient;
    if (process.env.GATEWAY_URL) {
      client = new HttpGatewayClient({
        baseUrl: process.env.GATEWAY_URL,
        secret: process.env.GATEWAY_SECRET || '',
      });
    } else {
      client = new DirectGraphGatewayClient(graphClient);
    }

    const response = await runBriefingPipeline({
      client,
      graphClient,
      workspaceId,
      request: {
        task,
        files,
        components,
        contributorId: contributorId ?? undefined,
        asOf,
        anonymousSessionId,
      },
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    const message = error?.message || 'Unknown server error';
    const isConnectionError =
      message.includes('ECONNREFUSED') ||
      message.includes('timeout') ||
      message.includes('SocketClosed') ||
      message.includes('unreachable');

    if (isConnectionError) {
      return NextResponse.json(
        {
          status: 'FALKORDB_TIMEOUT',
          reason:
            'FalkorDB Graph Unreachable (503): Database connection timed out or direct VPC egress failed. Verify gateway credentials and network access.',
          error: message,
          briefing: null,
          evidence: { nodeCount: 0, verifiedCitationCount: 0 },
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        status: 'SERVER_ERROR',
        reason: message,
        briefing: null,
      },
      { status: 500 }
    );
  }
}
