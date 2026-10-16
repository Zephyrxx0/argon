import type { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import { ErrorCodes, type GatewayErrorResponse, type JwtAuthUser } from '../types.js';

export type { JwtAuthUser };

export function jwtAuthMiddleware(secretOverride?: string): MiddlewareHandler {
  return async (c, next) => {
    const secret = secretOverride ?? process.env.BETTER_AUTH_SECRET ?? process.env.GATEWAY_SECRET;

    if (c.req.path.startsWith('/api/v1/webhooks')) {
      return await next();
    }

    if (!secret || secret.trim() === '') {
      const errorResponse: GatewayErrorResponse = {
        error: 'Server authentication unconfigured',
        code: ErrorCodes.AUTH_CONFIG_ERROR,
      };
      return c.json(errorResponse, 500);
    }

    const authHeader = c.req.header('Authorization');
    const queryToken = c.req.query('token');
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (queryToken) {
      token = queryToken.trim();
    }

    if (!token) {
      const errorResponse: GatewayErrorResponse = {
        error: 'Missing or malformed Authorization header',
        code: ErrorCodes.UNAUTHORIZED,
      };
      return c.json(errorResponse, 401);
    }

    // Backward compatibility: static secret matching for internal dev & test harnesses
    if (token === secret) {
      c.set('user', { userId: 'admin', isAnonymous: false } satisfies JwtAuthUser);
      return await next();
    }

    try {
      const payload = (await verify(token, secret, 'HS256')) as Record<string, unknown>;
      const userId = String(payload.userId ?? payload.sub ?? '');
      const isAnonymous = Boolean(payload.isAnonymous);

      if (!userId) {
        const errorResponse: GatewayErrorResponse = {
          error: 'Token missing subject claim',
          code: ErrorCodes.UNAUTHORIZED,
        };
        return c.json(errorResponse, 401);
      }

      const user: JwtAuthUser = {
        ...payload,
        userId,
        isAnonymous,
      };
      c.set('user', user);
      await next();
    } catch (err: any) {
      const errorResponse: GatewayErrorResponse = {
        error: err?.message ? `Invalid Bearer token: ${err.message}` : 'Invalid Bearer token',
        code: ErrorCodes.UNAUTHORIZED,
      };
      return c.json(errorResponse, 401);
    }
  };
}
