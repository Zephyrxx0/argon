import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { computeSignature, timingSafeCompare, webhookSignatureValidator } from '../../src/middleware/webhook-auth.js';

describe('Webhook Authentication Middleware (Task 08-01-01, SYNC-01)', () => {
  const secret = 'test-webhook-secret-12345';
  const originalEnv = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = originalEnv;
  });

  it('computes valid sha256 HMAC signature', () => {
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    const sig = computeSignature(body, secret);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('timingSafeCompare correctly compares equal and unequal signatures', () => {
    const sig1 = 'sha256=abcdef123456';
    const sig2 = 'sha256=abcdef123456';
    const sig3 = 'sha256=abcdef999999';
    const sig4 = 'sha256=short';

    expect(timingSafeCompare(sig1, sig2)).toBe(true);
    expect(timingSafeCompare(sig1, sig3)).toBe(false);
    expect(timingSafeCompare(sig1, sig4)).toBe(false);
  });

  it('rejects request with missing X-Hub-Signature-256 header with 401 MISSING_SIGNATURE', async () => {
    const app = new Hono();
    app.use('/webhook', webhookSignatureValidator(secret));
    app.post('/webhook', (c) => c.json({ ok: true }));

    const res = await app.request('/webhook', {
      method: 'POST',
      body: JSON.stringify({ test: 123 }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.code).toBe('MISSING_SIGNATURE');
  });

  it('rejects request with invalid signature with 401 INVALID_SIGNATURE', async () => {
    const app = new Hono();
    app.use('/webhook', webhookSignatureValidator(secret));
    app.post('/webhook', (c) => c.json({ ok: true }));

    const res = await app.request('/webhook', {
      method: 'POST',
      body: JSON.stringify({ test: 123 }),
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.code).toBe('INVALID_SIGNATURE');
  });

  it('accepts request with valid HMAC-SHA256 signature', async () => {
    const app = new Hono();
    app.use('/webhook', webhookSignatureValidator(secret));
    app.post('/webhook', (c) => {
      const payload = (c.get as any)('webhookPayload');
      return c.json({ ok: true, payload });
    });

    const body = JSON.stringify({ repository: { name: 'argon' }, ref: 'refs/heads/main' });
    const sig = computeSignature(body, secret);

    const res = await app.request('/webhook', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sig,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.payload.repository.name).toBe('argon');
  });
});
