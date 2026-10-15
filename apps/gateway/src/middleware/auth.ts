import type { MiddlewareHandler } from 'hono';
import { ErrorCodes, type GatewayErrorResponse } from '../types.js';

export function bearerAuthMiddleware(gatewaySecret?: string): MiddlewareHandler {
  return async (c, next) => {
    const secret = gatewaySecret ?? process.env.GATEWAY_SECRET;

    if (!secret || secret.trim() === '') {
      const errorResponse: GatewayErrorResponse = {
        error: 'Server authentication unconfigured',
        code: ErrorCodes.AUTH_CONFIG_ERROR,
      };
      return c.json(errorResponse, 500);
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Missing or malformed Authorization header',
        code: ErrorCodes.UNAUTHORIZED,
      };
      return c.json(errorResponse, 401);
    }

    const token = authHeader.slice(7).trim();
    if (token !== secret) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Invalid Bearer token',
        code: ErrorCodes.UNAUTHORIZED,
      };
      return c.json(errorResponse, 401);
    }

    await next();
  };
}

