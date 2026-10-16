import crypto from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { type GatewayErrorResponse } from '../types.js';

export function computeSignature(rawBody: string | Buffer, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

export function webhookSignatureValidator(secretOverride?: string): MiddlewareHandler {
  return async (c, next) => {
    const signature = c.req.header('X-Hub-Signature-256') || c.req.header('x-hub-signature-256');

    if (!signature) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Missing X-Hub-Signature-256 header',
        code: 'MISSING_SIGNATURE',
      };
      return c.json(errorResponse, 401);
    }

    const secret = secretOverride ?? process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret || secret.trim() === '') {
      const errorResponse: GatewayErrorResponse = {
        error: 'Webhook authentication unconfigured',
        code: 'AUTH_CONFIG_ERROR',
      };
      return c.json(errorResponse, 500);
    }

    const rawBody = await c.req.text();
    const expectedSignature = computeSignature(rawBody, secret);

    if (!timingSafeCompare(signature, expectedSignature)) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE',
      };
      return c.json(errorResponse, 401);
    }

    // Attach rawBody and parsed payload to context
    try {
      const parsed = JSON.parse(rawBody);
      c.set('webhookPayload', parsed);
    } catch {
      c.set('webhookPayload', null);
    }
    c.set('rawWebhookBody', rawBody);

    await next();
  };
}
