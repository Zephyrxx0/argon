import { createHash } from 'node:crypto';
import type { CanonicalAuthor, ResolvedAuthor } from './types.js';

/**
 * Hash an author email using SHA-256 for privacy preservation.
 * Raw emails are never stored in the database.
 */
export function hashAuthorEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Parses a standard git .mailmap file content.
 * Standard format:
 * Proper Name <proper@email.xx> Commit Name <commit@email.xx>
 * Proper Name <proper@email.xx> <commit@email.xx>
 * Proper Name <proper@email.xx>
 * <proper@email.xx> <commit@email.xx>
 */
export function parseMailmap(content: string): Map<string, CanonicalAuthor> {
  const mapping = new Map<string, CanonicalAuthor>();
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const emailMatches = [...line.matchAll(/<([^>]+)>/g)];
    if (emailMatches.length === 0) {
      continue;
    }

    if (emailMatches.length >= 2) {
      const properEmail = emailMatches[0][1].trim().toLowerCase();
      const commitEmail = emailMatches[1][1].trim().toLowerCase();
      const properName = line.slice(0, emailMatches[0].index).trim();

      mapping.set(commitEmail, {
        name: properName || '',
        email: properEmail,
      });
    } else if (emailMatches.length === 1) {
      const properEmail = emailMatches[0][1].trim().toLowerCase();
      const properName = line.slice(0, emailMatches[0].index).trim();
      if (properName) {
        mapping.set(properEmail, {
          name: properName,
          email: properEmail,
        });
      }
    }
  }

  return mapping;
}

/**
 * Resolves an author against .mailmap if provided, and hashes email into Person.id.
 */
export function resolveAuthor(
  rawName: string,
  rawEmail: string,
  mailmap?: Map<string, CanonicalAuthor>
): ResolvedAuthor {
  const normalizedEmail = (rawEmail || '').toLowerCase().trim();
  const normalizedName = (rawName || '').trim();

  let finalName = normalizedName;
  let finalEmail = normalizedEmail;

  if (mailmap && mailmap.has(normalizedEmail)) {
    const canonical = mailmap.get(normalizedEmail)!;
    if (canonical.name) {
      finalName = canonical.name;
    }
    if (canonical.email) {
      finalEmail = canonical.email;
    }
  }

  const emailHash = hashAuthorEmail(finalEmail || finalName);

  return {
    id: emailHash,
    name: finalName || 'Unknown Contributor',
    emailHash,
  };
}
