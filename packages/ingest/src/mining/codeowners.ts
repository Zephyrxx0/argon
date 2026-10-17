import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ComponentDefinition } from '../coupling/types.js';

export interface CodeOwnersRule {
  pattern: string;
  owners: string[];
  regex: RegExp;
  line: number;
}

/** Locations GitHub reads, in precedence order. */
export const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

/**
 * Converts a CODEOWNERS (gitignore-style) pattern to a regular expression over repo-relative
 * paths. Supported: leading `/` (anchored to the root), trailing `/` (a directory and everything
 * below it), `*` (any run of characters except `/`), `**` (any depth), `?`, and bare names which
 * match at any depth. Negation (`!`) and character classes are not supported by GitHub either.
 */
export function codeOwnersPatternToRegex(pattern: string): RegExp {
  let p = pattern.trim();
  const anchoredAtRoot = p.startsWith('/');
  const directoryOnly = p.endsWith('/');
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');
  const anchored = anchoredAtRoot || p.includes('/');

  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!;
    if (ch === '*') {
      if (p[i + 1] === '*') {
        // `**/` = zero or more directories, `/**` and trailing `**` = anything below
        if (p[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const prefix = anchored ? '^' : '(?:^|.*/)';
  // A pattern that names a directory (or a plain path) covers everything below it. A wildcard in
  // the last segment (`docs/*`, `*.js`) matches only that level, as GitHub documents.
  const lastSegment = p.split('/').pop() ?? '';
  const wildcardLast = /[*?]/.test(lastSegment) && lastSegment !== '**';
  const suffix = directoryOnly ? '/.*$' : wildcardLast ? '$' : '(?:/.*)?$';
  return new RegExp(`${prefix}${re}${suffix}`);
}

/** Parses CODEOWNERS text. Comments and blank lines are skipped; a rule with no owner un-owns. */
export function parseCodeOwners(content: string): CodeOwnersRule[] {
  const rules: CodeOwnersRule[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || pattern.startsWith('!') || pattern.startsWith('[')) continue; // sections / negation are not CODEOWNERS rules
    rules.push({ pattern, owners, regex: codeOwnersPatternToRegex(pattern), line: i + 1 });
  }
  return rules;
}

/** Owners of a file: the LAST matching rule wins (GitHub semantics). */
export function ownersOfFile(rules: CodeOwnersRule[], filePath: string): { owners: string[]; pattern: string } | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  for (let i = rules.length - 1; i >= 0; i--) {
    if (rules[i]!.regex.test(normalized)) return { owners: rules[i]!.owners, pattern: rules[i]!.pattern };
  }
  return null;
}

export interface ComponentOwnership {
  component: string;
  /** Raw CODEOWNERS token: `@login`, `@org/team` or an email address. */
  owner: string;
  /** The pattern that assigns most of the component's files to this owner. */
  pattern: string;
  /** Share of the component's files owned (0..1]. */
  coverage: number;
}

/**
 * Owner of record per component: owners that CODEOWNERS assigns to at least `minCoverage` of
 * the component's files.
 */
export function computeComponentOwnership(
  rules: CodeOwnersRule[],
  components: ComponentDefinition[],
  minCoverage = 0.5
): ComponentOwnership[] {
  const out: ComponentOwnership[] = [];
  for (const component of components) {
    if (component.files.length === 0) continue;
    const owned = new Map<string, { files: number; patterns: Map<string, number> }>();
    for (const file of component.files) {
      const hit = ownersOfFile(rules, file);
      if (!hit) continue;
      for (const owner of hit.owners) {
        const entry = owned.get(owner) ?? { files: 0, patterns: new Map() };
        entry.files += 1;
        entry.patterns.set(hit.pattern, (entry.patterns.get(hit.pattern) ?? 0) + 1);
        owned.set(owner, entry);
      }
    }
    for (const [owner, entry] of owned) {
      const coverage = entry.files / component.files.length;
      if (coverage < minCoverage) continue;
      const pattern = [...entry.patterns].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
      out.push({ component: component.name, owner, pattern, coverage: Math.round(coverage * 100) / 100 });
    }
  }
  return out;
}

/** Reads the repository's CODEOWNERS file, if any. */
export async function readCodeOwners(repoPath: string): Promise<{ file: string; rules: CodeOwnersRule[] } | null> {
  for (const rel of CODEOWNERS_PATHS) {
    try {
      const content = await fs.promises.readFile(path.join(repoPath, rel), 'utf8');
      return { file: rel, rules: parseCodeOwners(content.slice(0, 256 * 1024)) };
    } catch {
      // try the next location
    }
  }
  return null;
}

export type OwnerToken =
  | { kind: 'team'; id: string; name: string }
  | { kind: 'user'; login: string }
  | { kind: 'email'; email: string };

/** Classifies a CODEOWNERS owner token. */
export function classifyOwner(token: string): OwnerToken | null {
  const t = token.trim();
  if (/^@[\w.-]+\/[\w.-]+$/.test(t)) {
    const id = t.toLowerCase();
    return { kind: 'team', id, name: id.split('/')[1]! };
  }
  if (/^@[\w.-]+$/.test(t)) return { kind: 'user', login: t.slice(1) };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { kind: 'email', email: t.toLowerCase() };
  return null;
}
