import { describe, it, expect, vi } from 'vitest';
import {
  extractExplicitEntities,
  sanitizePath,
  resolveBriefingScope,
} from '../src/briefing/resolver.js';
import type { GatewayClient } from '../src/client/types.js';
import type { ArgonEmbedder } from '@argon/graph';

describe('Hybrid Scope Resolver', () => {
  it('extracts file paths and components from natural language task description', () => {
    const text =
      'Refactor auth in packages/graph/src/client.ts and update queries/01_resolve_scope.cypher for apps/gateway';

    const entities = extractExplicitEntities(text);

    expect(entities.files).toContain('packages/graph/src/client.ts');
    expect(entities.files).toContain('queries/01_resolve_scope.cypher');
    expect(entities.components).toContain('packages/graph');
    expect(entities.components).toContain('apps/gateway');
  });

  it('sanitizes directory traversal sequences from extracted paths', () => {
    expect(sanitizePath('../../etc/passwd.json')).toBe('etc/passwd.json');
    expect(sanitizePath('../../../secret/config.yml')).toBe('secret/config.yml');
    expect(sanitizePath('./packages/agent/src/index.ts')).toBe('packages/agent/src/index.ts');
  });

  it('resolves briefing scope combining entities, resolveScope query, and 512-d embedding', async () => {
    const mockVector = new Array(512).fill(0.1);
    const mockEmbedder = {
      embed: vi.fn().mockResolvedValue({
        vector: mockVector,
        dim: 512,
        provider: 'local',
        model: 'embeddinggemma-2',
      }),
    } as unknown as ArgonEmbedder;

    const mockClient = {
      executeQuery: vi.fn().mockResolvedValue({
        raw: [
          {
            matchedFiles: [{ path: 'packages/graph/src/client.ts' }],
            allComponents: [{ name: 'packages/graph' }],
          },
        ],
        graph: { nodes: [], edges: [] },
        evidence: { nodeCount: 1, edgeCount: 0, primaryIds: ['packages/graph/src/client.ts'] },
      }),
    } as unknown as GatewayClient;

    const scope = await resolveBriefingScope(mockClient, mockEmbedder, 'ws-test', {
      task: 'Update packages/graph/src/client.ts connection logic',
      asOf: 1700000000,
      contributorId: 'dev-1',
    });

    expect(scope.files).toContain('packages/graph/src/client.ts');
    expect(scope.components).toContain('packages/graph');
    expect(scope.queryVector).toHaveLength(512);
    expect(scope.asOf).toBe(1700000000);
    expect(scope.contributorId).toBe('dev-1');
    expect(mockEmbedder.embed).toHaveBeenCalledWith(
      'Update packages/graph/src/client.ts connection logic',
      true
    );
  });
});

