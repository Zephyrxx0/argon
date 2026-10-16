export const SECRET_PATTERNS: RegExp[] = [
  /ghs_[A-Za-z0-9_]{20,}/g,
  /ghp_[A-Za-z0-9_]{20,}/g,
  /gho_[A-Za-z0-9_]{20,}/g,
  /ghu_[A-Za-z0-9_]{20,}/g,
  /ghr_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /Bearer\s+[A-Za-z0-9_.-]+/gi,
  /Basic\s+[A-Za-z0-9+/=]+/gi,
  /x-access-token:[^@\s]+@/gi,
  /https:\/\/[^@\s]+@/gi,
];

/**
 * Redacts known tokens, secrets, and in-URL credentials from string input.
 */
export function redactSecrets(input: string | null | undefined): string {
  if (!input) {
    return input ?? '';
  }

  let sanitized = String(input);

  // Redact URL credentials first
  sanitized = sanitized.replace(/https:\/\/[^@\s]+@/gi, 'https://');
  sanitized = sanitized.replace(/x-access-token:[^@\s]+@/gi, '');

  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }

  return sanitized;
}

/**
 * Sanitizes an error object, stripping secrets from message and stack trace.
 */
export function sanitizeError(err: unknown): Error {
  if (err instanceof Error) {
    const sanitizedMsg = redactSecrets(err.message);
    const sanitizedErr = new Error(sanitizedMsg);
    sanitizedErr.name = err.name;
    if (err.stack) {
      sanitizedErr.stack = redactSecrets(err.stack);
    }
    return sanitizedErr;
  }
  return new Error(redactSecrets(String(err)));
}

/**
 * Creates a structured, sanitized authentication failure error without leaking subprocess output.
 */
export function createSanitizedAuthError(originalError: unknown): Error {
  const sanitized = sanitizeError(originalError);
  const authErr = new Error(
    `AUTH_FAILED_EXPIRED_OR_REVOKED: GitHub installation token expired or permissions revoked — please re-authorize GitHub App. Details: ${sanitized.message}`
  );
  authErr.name = 'GitHubAuthError';
  return authErr;
}
