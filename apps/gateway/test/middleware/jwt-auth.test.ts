import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { jwtAuthMiddleware } from '../../src/middleware/jwt.js';
import type { GatewayErrorResponse, JwtAuthUser } from '../../src/types.js';

describe('Gateway JWT Middleware', () => {
  const SECRET = 'test-secret-at-least-32-chars-long-abc-123';

  function createTestApp(secretOverride?: string) {
    const app = new Hono<{ Variables: { user: JwtAuthUser } }>();
    app.use('/api/*', jwtAuthMiddleware(secretOverride));
    app.get('/api/protected', (c) => {
      const user = c.get('user');
      return c.json({ ok: true, user });
    });
    return app;
  }

  it('fails with 500 AUTH_CONFIG_ERROR when no secret is configured', async () => {
    const origEnv = process.env.BETTER_AUTH_SECRET;
    const origGatewayEnv = process.env.GATEWAY_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.GATEWAY_SECRET;

    const app = createTestApp('');
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer some-token' },
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('AUTH_CONFIG_ERROR');

    process.env.BETTER_AUTH_SECRET = origEnv;
    process.env.GATEWAY_SECRET = origGatewayEnv;
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = createTestApp(SECRET);
    const res = await app.request('/api/protected');

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('Missing or malformed Authorization header');
  });

  it('returns 401 when Authorization header does not use Bearer scheme', async () => {
    const app = createTestApp(SECRET);
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Basic token123' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('accepts static secret matching for internal dev and test harnesses (backward compatibility)', async () => {
    const app = createTestApp(SECRET);
    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; user: JwtAuthUser };
    expect(body.ok).toBe(true);
    expect(body.user.userId).toBe('admin');
    expect(body.user.isAnonymous).toBe(false);
  });

  it('accepts valid HS256 JWT and populates c.get("user")', async () => {
    const app = createTestApp(SECRET);
    const token = await sign(
      {
        userId: 'usr_octocat_123',
        login: 'octocat',
        isAnonymous: false,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      SECRET,
      'HS256'
    );

    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; user: JwtAuthUser };
    expect(body.ok).toBe(true);
    expect(body.user.userId).toBe('usr_octocat_123');
    expect(body.user.isAnonymous).toBe(false);
    expect((body.user as any).login).toBe('octocat');
  });

  it('accepts valid anonymous guest JWT and sets user.isAnonymous = true', async () => {
    const app = createTestApp(SECRET);
    const token = await sign(
      {
        sub: 'guest_uuid_999',
        isAnonymous: true,
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      SECRET,
      'HS256'
    );

    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; user: JwtAuthUser };
    expect(body.ok).toBe(true);
    expect(body.user.userId).toBe('guest_uuid_999');
    expect(body.user.isAnonymous).toBe(true);
  });

  it('rejects JWT signed with a different secret', async () => {
    const app = createTestApp(SECRET);
    const invalidToken = await sign(
      {
        userId: 'attacker',
        isAnonymous: false,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      'attacker-different-secret-key-12345678',
      'HS256'
    );

    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${invalidToken}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('Invalid Bearer token');
  });

  it('rejects expired JWT token', async () => {
    const app = createTestApp(SECRET);
    const expiredToken = await sign(
      {
        userId: 'usr_expired',
        isAnonymous: false,
        exp: Math.floor(Date.now() / 1000) - 100, // 100 seconds ago
      },
      SECRET,
      'HS256'
    );

    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('rejects token missing userId/sub claims', async () => {
    const app = createTestApp(SECRET);
    const malformedPayloadToken = await sign(
      {
        isAnonymous: false,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      SECRET,
      'HS256'
    );

    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${malformedPayloadToken}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as GatewayErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toContain('Token missing subject claim');
  });
});

describe('jwtAuthMiddleware with distinct GATEWAY_SECRET and BETTER_AUTH_SECRET', () => {
  it('accepts session JWTs signed with BETTER_AUTH_SECRET even when the gateway secret differs', async () => {
    const { sign } = await import('hono/jwt');
    const { Hono } = await import('hono');
    const { jwtAuthMiddleware } = await import('../../src/middleware/jwt.js');

    const prev = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = 'better-auth-secret-0123456789abcdef';
    try {
      const app = new Hono();
      app.use('/api/*', jwtAuthMiddleware('gateway-static-secret-fedcba9876543210'));
      app.get('/api/ping', (c) => c.json({ user: c.get('user' as never) }));

      const exp = Math.floor(Date.now() / 1000) + 600;
      const good = await sign({ userId: 'u1', isAnonymous: true, exp }, process.env.BETTER_AUTH_SECRET!, 'HS256');
      const forged = await sign({ userId: 'u1', exp }, 'some-other-secret', 'HS256');

      const ok = await app.request('/api/ping', { headers: { Authorization: `Bearer ${good}` } });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as any).user.userId).toBe('u1');

      expect((await app.request('/api/ping', { headers: { Authorization: `Bearer ${forged}` } })).status).toBe(401);
      // BETTER_AUTH_SECRET itself must NOT work as a static admin bearer token
      expect(
        (await app.request('/api/ping', { headers: { Authorization: `Bearer ${process.env.BETTER_AUTH_SECRET}` } })).status
      ).toBe(401);
      // the static gateway secret still does
      expect(
        (await app.request('/api/ping', { headers: { Authorization: 'Bearer gateway-static-secret-fedcba9876543210' } })).status
      ).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = prev;
    }
  });
});
