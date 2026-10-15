import { serve } from '@hono/node-server';
import { ArgonGraphClient } from '@argon/graph';
import dotenv from 'dotenv';
import { createGatewayApp } from './app.js';

dotenv.config();

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
