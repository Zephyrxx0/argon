import { serve } from '@hono/node-server';
import { ArgonGraphClient } from '@argon/graph';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createGatewayApp } from './app.js';

// Load the shared repo-root .env (works from src/ under tsx and from dist/ after build),
// then fall back to a package-local .env. Existing process env vars always win.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config();

// A failure inside a background job (e.g. an ingestion's model download) must never take the
// whole gateway down with it: log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[Gateway] Unhandled promise rejection (kept alive):', reason);
});

const port = Number(process.env.PORT ?? 8080);
const graphClient = new ArgonGraphClient();

async function start() {
  try {
    await graphClient.connect();
    console.log(`[Gateway] Connected to FalkorDB at ${graphClient.url}`);
  } catch (err: any) {
    console.warn(`[Gateway] Warning: Could not connect to FalkorDB on startup: ${err?.message}`);
  }

  const app = createGatewayApp({
    graphClient,
    gatewaySecret: process.env.GATEWAY_SECRET,
  });

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`[Gateway] Server listening on http://localhost:${info.port}`);
    }
  );

  const shutdown = async (signal: string) => {
    console.log(`[Gateway] Received ${signal}, closing server...`);
    server.close(async () => {
      await graphClient.close();
      console.log('[Gateway] Server closed gracefully.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[Gateway] Fatal startup error:', err);
  process.exit(1);
});
