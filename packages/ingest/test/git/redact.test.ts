import { describe, it, expect } from 'vitest';
import { redactSecrets, sanitizeError, createSanitizedAuthError } from '../../src/git/redact.js';

describe('redactSecrets', () => {
  it('redacts GitHub App installation tokens (ghs_)', () => {
    const input = 'Cloning with token ghs_9876543210abcdefghijklmnop and more text';
    expect(redactSecrets(input)).toBe('Cloning with token [REDACTED_SECRET] and more text');
  });

  it('redacts GitHub personal access tokens (ghp_)', () => {
    const input = 'Auth header ghp_abcdefghijklmnopqrstuvwxyz123456';
    expect(redactSecrets(input)).toBe('Auth header [REDACTED_SECRET]');
  });

  it('redacts fine-grained personal access tokens (github_pat_)', () => {
    const input = 'Fine-grained github_pat_11AAAAAAA0abcdef123456_morecharactershere';
    expect(redactSecrets(input)).toBe('Fine-grained [REDACTED_SECRET]');
  });

  it('redacts Bearer and Basic headers', () => {
    const bearer = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
    const basic = 'Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2hzXzEyMzQ1Njc4OTA=';
    expect(redactSecrets(bearer)).toBe('Authorization: [REDACTED_SECRET]');
    expect(redactSecrets(basic)).toBe('Authorization: [REDACTED_SECRET]');
  });

  it('redacts credentials embedded in URLs', () => {
    const url1 = 'https://x-access-token:ghs_secrettoken1234567890@github.com/argon/repo.git';
    const url2 = 'https://user:password123@gitlab.com/group/project.git';
    expect(redactSecrets(url1)).toBe('https://github.com/argon/repo.git');
    expect(redactSecrets(url2)).toBe('https://gitlab.com/group/project.git');
  });

  it('handles empty, null, or undefined inputs gracefully', () => {
    expect(redactSecrets('')).toBe('');
    expect(redactSecrets(null as any)).toBe('');
    expect(redactSecrets(undefined as any)).toBe('');
  });
});

describe('sanitizeError', () => {
  it('sanitizes Error message and stack trace', () => {
    const err = new Error('Failed to fetch ghs_secret1234567890abcdefghijklmn');
    err.stack = 'Error at git.clone (ghs_secret1234567890abcdefghijklmn:1:1)';

    const sanitized = sanitizeError(err);
    expect(sanitized.message).not.toContain('ghs_secret');
    expect(sanitized.message).toContain('[REDACTED_SECRET]');
    expect(sanitized.stack).not.toContain('ghs_secret');
    expect(sanitized.stack).toContain('[REDACTED_SECRET]');
  });
});

describe('createSanitizedAuthError', () => {
  it('returns formatted auth error with AUTH_FAILED_EXPIRED_OR_REVOKED code', () => {
    const rawError = new Error('fatal: Authentication failed for https://x-access-token:ghs_secret@github.com');
    const authErr = createSanitizedAuthError(rawError);

    expect(authErr.name).toBe('GitHubAuthError');
    expect(authErr.message).toContain('AUTH_FAILED_EXPIRED_OR_REVOKED');
    expect(authErr.message).not.toContain('ghs_secret');
    expect(authErr.message).toContain('please re-authorize GitHub App');
  });
});
