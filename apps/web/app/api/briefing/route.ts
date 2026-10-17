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
    // The client must be connected before the tenant check and the pipeline can query it.
    // If FalkorDB is down this stays unconnected and the pipeline refuses ("no graph, no answer").
    try {
      await graphClient.connect();
    } catch {
      // handled downstream: ping() is false and queries throw FalkorUnavailableError
    }

    // Extract caller identity from Bearer token if present (TENANT-01)
    let callerToken: string | undefined;
    let userId = 'anonymous';
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      callerToken = authHeader.slice(7);
      try {
        const { jwtVerify } = await import('jose');
        const secret = new TextEncoder().encode(
          process.env.BETTER_AUTH_SECRET || 'argon-dev-secret-at-least-32-chars-long'
        );
        const verified = await jwtVerify(callerToken, secret);
        userId =
          (verified.payload.userId as string) ||
          (verified.payload.sub as string) ||
          'anonymous';
      } catch {
        // Fallback to anonymous if token invalid/expired
      }
    }

    // Verify tenant workspace authorization
    try {
      const isLive = await graphClient.ping();
      if (isLive) {
        const { checkWorkspaceAccess } = await import('@argon/graph');
        const access = await checkWorkspaceAccess(graphClient, workspaceId, userId);
        if (!access.exists) {
          return NextResponse.json(
            {
              error: 'NOT_FOUND',
              status: 'NOT_FOUND',
              message: `Workspace '${workspaceId}' not found`,
            },
            { status: 404 }
          );
        }
        if (!access.allowed) {
          return NextResponse.json(
            {
              error: 'FORBIDDEN',
              status: 'FORBIDDEN',
              message: 'Workspace access denied',
            },
            { status: 403 }
          );
        }
      }
    } catch (accessErr: any) {
      if (
        accessErr?.message?.includes('ECONNREFUSED') ||
        accessErr?.name === 'FalkorUnavailableError'
      ) {
        // Allow pipeline call to handle 503 cleanly
      } else {
        throw accessErr;
      }
    }

    // Client auto-selection conforming to D-12
    let client: GatewayClient;
    if (process.env.GATEWAY_URL) {
      client = new HttpGatewayClient({
        baseUrl: process.env.GATEWAY_URL,
        secret: callerToken || process.env.GATEWAY_SECRET || '',
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
