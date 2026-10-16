// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { auth } from '@/lib/auth';
import { authClient, signIn, signOut, useSession } from '@/lib/auth-client';
import { GET, POST } from '@/app/api/auth/[...all]/route';
import { jwtVerify } from 'jose';

describe('Better Auth Server', () => {
  it('exports auth instance with anonymous and jwt plugins configured', () => {
    expect(auth).toBeDefined();
    expect(auth.options).toBeDefined();
    expect(auth.options.plugins).toBeDefined();

    const pluginIds = auth.options.plugins?.map((p: any) => p.id);
    expect(pluginIds).toContain('anonymous');
    expect(pluginIds).toContain('jwt');
  });

  it('exports valid Next.js App Router route handlers', () => {
    expect(typeof GET).toBe('function');
    expect(typeof POST).toBe('function');
  });

  it('exports authClient with expected helpers', () => {
    expect(authClient).toBeDefined();
    expect(typeof signIn).toBe('function');
    expect(typeof signOut).toBe('function');
    expect(typeof useSession).toBe('function');
  });

  it('signs and verifies HS256 JWT containing userId and isAnonymous claims', async () => {
    const secretKey = process.env.BETTER_AUTH_SECRET || 'argon-dev-secret-at-least-32-chars-long';
    const secret = new TextEncoder().encode(secretKey);

    // Create an anonymous user session via auth.api
    const sessionRes = await auth.api.signInAnonymous({ asResponse: true });
    expect(sessionRes.status).toBe(200);

    const setCookie = sessionRes.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();

    // Fetch token using the session cookie
    const tokenRes = await auth.api.getToken({
      headers: new Headers({ cookie: setCookie || '' }),
    });

    expect(tokenRes).toBeDefined();
    expect(tokenRes?.token).toBeTypeOf('string');

    // Verify token with jose jwtVerify using shared secret
    const { payload, protectedHeader } = await jwtVerify(tokenRes!.token, secret, {
      algorithms: ['HS256'],
    });

    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.userId).toBeTruthy();
    expect(payload.userId).toBe(payload.sub);
    expect(payload.isAnonymous).toBe(true);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
