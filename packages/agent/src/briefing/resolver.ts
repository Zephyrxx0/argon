import type { ArgonEmbedder } from '@argon/graph';
import type { GatewayClient } from '../client/types.js';
import type { BriefingScopeInput, ResolvedScope } from './types.js';

const FILE_PATH_REGEX =
  /(?:^|[\s"'`(\[])([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|go|rs|md|json|cypher|yml|yaml|css|html))\b/g;

const COMPONENT_REGEX =
  /(?:(?:packages|apps|components|modules|services)\/[a-zA-Z0-9_\-]+)\b/g;

export function sanitizePath(rawPath: string): string {
  // Normalize backslashes to forward slashes
  let p = rawPath.replace(/\\/g, '/');
  // Strip directory traversal sequences: ../ or ..\
  p = p.replace(/(?:\.\.\/)+/g, '');
  // Strip leading ./
  p = p.replace(/^\.\//, '');
  // Remove any surrounding quotes or brackets
  p = p.replace(/^['"`([\]]+|['"`)[\]]+$/g, '');
  return p.trim();
}

export function extractExplicitEntities(text: string): {
  files: string[];
  components: string[];
} {
  const fileSet = new Set<string>();
  const componentSet = new Set<string>();

  // Extract file matches
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = FILE_PATH_REGEX.exec(text)) !== null) {
    const raw = fileMatch[1];
    const sanitized = sanitizePath(raw);
    if (sanitized && !sanitized.endsWith('/')) {
      fileSet.add(sanitized);
    }
  }

  // Extract component matches
  let compMatch: RegExpExecArray | null;
  while ((compMatch = COMPONENT_REGEX.exec(text)) !== null) {
    const raw = compMatch[0];
    const sanitized = sanitizePath(raw);
    if (sanitized) {
      componentSet.add(sanitized);
    }
  }

  return {
    files: Array.from(fileSet),
    components: Array.from(componentSet),
  };
}

const MAX_NAME_CANDIDATES = 40;

/**
 * Bare words from the task that might be component names ("work on hooks and lib").
 * These are only *candidates*: they are exact-matched against Component nodes by the
 * parameterized resolveScope query, so anything that is not a real component is ignored
 * and nothing unverified ever reaches the briefing.
 */
export function extractNameCandidates(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[^A-Za-z0-9_.@-]+/)) {
    const token = raw.replace(/\.+$/, '');
    if (token.length >= 2 && token.length <= 100) out.add(token);
    if (out.size >= MAX_NAME_CANDIDATES) break;
  }
  return Array.from(out);
}

export async function resolveBriefingScope(
  client: GatewayClient,
  embedder: ArgonEmbedder,
  workspaceId: string,
  input: BriefingScopeInput
): Promise<ResolvedScope> {
  const extracted = extractExplicitEntities(input.task);

  const rawCandidateFiles = [
    ...(input.files ?? []),
    ...extracted.files,
  ].map(sanitizePath).filter(Boolean);

  const rawCandidateComponents = [
    ...(input.components ?? []),
    ...extracted.components,
  ].map(sanitizePath).filter(Boolean);

  const uniqueFiles = Array.from(new Set(rawCandidateFiles));
  const uniqueComponents = Array.from(new Set(rawCandidateComponents));

  // Component names mentioned as plain words are looked up too (verified against the graph)
  const queryNames = Array.from(
    new Set([...uniqueComponents, ...extractNameCandidates(input.task)])
  ).slice(0, MAX_NAME_CANDIDATES * 2);

  // Concurrently resolve graph scope and vector embedding
  const [resolveScopeResult, embedResult] = await Promise.all([
    uniqueFiles.length > 0 || queryNames.length > 0
      ? client
          .executeQuery(workspaceId, 'resolveScope', {
            paths: uniqueFiles,
            names: queryNames,
          })
          .catch(() => null)
      : null,
    embedder.embed(input.task, true),
  ]);

  let finalFiles = uniqueFiles;
  let finalComponents = uniqueComponents;

  if (resolveScopeResult?.raw && Array.isArray(resolveScopeResult.raw) && resolveScopeResult.raw.length > 0) {
    const firstRow = resolveScopeResult.raw[0] as {
      matchedFiles?: Array<{ path?: string; properties?: { path?: string } }>;
      allComponents?: Array<{ name?: string; properties?: { name?: string } }>;
    };

    const matchedFiles = (firstRow.matchedFiles ?? [])
      .map((f) => f.path ?? f.properties?.path)
      .filter((p): p is string => Boolean(p));

    const matchedComponents = (firstRow.allComponents ?? [])
      .map((c) => c.name ?? c.properties?.name)
      .filter((n): n is string => Boolean(n));

    if (matchedFiles.length > 0) {
      finalFiles = Array.from(new Set([...matchedFiles, ...uniqueFiles]));
    }
    if (matchedComponents.length > 0) {
      finalComponents = Array.from(new Set([...matchedComponents, ...uniqueComponents]));
    }
  }

  return {
    files: finalFiles,
    components: finalComponents,
    queryVector: embedResult.vector,
    rawTask: input.task,
    asOf: input.asOf ?? Date.now(),
    contributorId: input.contributorId,
    anonymousSessionId: input.anonymousSessionId,
  };
}
