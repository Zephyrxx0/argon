import { describe, it, expect } from 'vitest';
import { dispatchRetrievalBundle } from '../src/briefing/dispatcher.js';
import { SourceCollector } from '../src/briefing/provenance.js';
import { buildBriefingPrompt } from '../src/briefing/prompt.js';
import type { GatewayClient } from '../src/client/types.js';
import type { EvidenceBundle, ResolvedScope } from '../src/briefing/types.js';

const payload = (raw: unknown[], primaryIds: string[] = []) => ({
  raw,
  graph: { nodes: [], edges: [] },
  evidence: { nodeCount: raw.length, edgeCount: 0, primaryIds },
});

const scope: ResolvedScope = {
  files: ['src/billing/retry.ts'],
  components: ['billing'],
  queryVector: new Array(512).fill(0.05),
  rawTask: 'Refactor src/billing/retry.ts',
  asOf: 1_700_000_000,
};

const CHAT_URL = 'https://chat.synthetic-demo.example/archives/payments-eng/p1';

describe('SourceCollector: chat origin (5.3)', () => {
  it('labels a chat decision as a chat thread and flags synthetic data', () => {
    const c = new SourceCollector();
    c.addDecisionOrigin('CHAT-1', 'Retry budget', CHAT_URL, { sourceKind: 'chat', synthetic: true, channel: '#payments-eng' });
    expect(c.sources).toEqual([
      { nodeId: 'CHAT-1', kind: 'chat', label: 'Chat thread #payments-eng (synthetic)', url: CHAT_URL, relatedTo: 'CHAT-1', synthetic: true },
    ]);
  });

  it('does not claim "synthetic" for a chat decision that is not flagged', () => {
    const c = new SourceCollector();
    c.addDecisionOrigin('CHAT-2', 't', CHAT_URL, { sourceKind: 'chat', synthetic: false, channel: '#eng' });
    expect(c.sources[0]).toMatchObject({ kind: 'chat', label: 'Chat thread #eng' });
    expect(c.sources[0]!.synthetic).toBeUndefined();
  });

  it('never emits a non-http(s) chat link', () => {
    const c = new SourceCollector();
    c.addDecisionOrigin('CHAT-3', 't', 'javascript:alert(1)', { sourceKind: 'chat', synthetic: true });
    c.addDecisionOrigin('CHAT-4', 't', undefined, { sourceKind: 'chat', synthetic: true });
    expect(c.sources).toEqual([]);
  });

  it('keeps classifying non-chat origins by URL, exactly as before', () => {
    const c = new SourceCollector();
    c.addDecisionOrigin('D1', 'ADR', 'https://github.com/o/r/blob/abc/docs/adr/1.md');
    c.addDecisionOrigin('D2', 'Commit', 'https://github.com/o/r/commit/0123456789abcdef');
    expect(c.sources.map((s) => s.kind)).toEqual(['document', 'commit']);
  });
});

describe('dispatcher: chat decisions in the evidence (5.3)', () => {
  const client = (rows: { constraining?: unknown[]; precedent?: unknown[] }): GatewayClient =>
    ({
      executeQuery: async (_ws: string, name: string) => {
        if (name === 'constrainingDecisions') return payload(rows.constraining ?? [], ['CHAT-1']);
        if (name === 'precedentSearch') return payload(rows.precedent ?? []);
        if (name === 'blastRadius') return payload([{ f: { path: 'src/billing/retry.ts' }, c: { name: 'billing' } }]);
        return payload([]);
      },
    }) as unknown as GatewayClient;

  it('carries kind / synthetic / channel / age inputs of a chat decision and its source link', async () => {
    const res = await dispatchRetrievalBundle(
      client({
        constraining: [
          {
            id: 'CHAT-1', title: 'Retry budget', status: 'accepted', component: 'billing', sourceUrl: CHAT_URL,
            validFrom: 1_676_030_400, sourceKind: 'chat', synthetic: true, sourceChannel: '#payments-eng',
            prId: 'PR-039', prNumber: 39, prUrl: 'https://github.com/o/r/pull/39',
          },
          { id: 'DEC-2', title: 'ADR', status: 'active', component: 'billing', sourceUrl: 'docs/adr/2.md', validFrom: 1_685_577_600, sourceKind: 'adr', synthetic: null },
        ],
      }),
      'ws',
      scope
    );
    const b = res.bundle!;
    expect(b.constrainingDecisions[0]).toMatchObject({
      decisionId: 'CHAT-1', sourceKind: 'chat', synthetic: true, sourceChannel: '#payments-eng', validFrom: 1_676_030_400,
    });
    expect(b.constrainingDecisions[1]!.synthetic).toBeUndefined();
    expect(b.sources!.find((s) => s.kind === 'chat')).toMatchObject({
      nodeId: 'CHAT-1', synthetic: true, label: 'Chat thread #payments-eng (synthetic)',
    });
    // the PR the thread was about is linked as well
    expect(b.sources!.some((s) => s.kind === 'pull_request' && s.relatedTo === 'CHAT-1')).toBe(true);
    // a repo-relative ADR path is not a link
    expect(b.sources!.some((s) => s.nodeId === 'DEC-2')).toBe(false);
  });

  it('recognises a chat precedent from the vector search node properties', async () => {
    const res = await dispatchRetrievalBundle(
      client({
        constraining: [{ id: 'X', title: 'x', status: 'active', component: 'billing' }],
        precedent: [
          {
            decision: { id: 7, labels: ['Decision'], properties: { id: 'CHAT-9', title: 'Queue cap', status: 'accepted', source_url: CHAT_URL, source_kind: 'chat', synthetic: true, source_channel: '#platform-sync', valid_from: 1_675_200_000 } },
            score: 0.9,
          },
        ],
      }),
      'ws',
      scope
    );
    expect(res.bundle!.precedents[0]).toMatchObject({ decisionId: 'CHAT-9', sourceKind: 'chat', synthetic: true, sourceChannel: '#platform-sync', validFrom: 1_675_200_000 });
    expect(res.bundle!.sources!.find((s) => s.nodeId === 'CHAT-9')).toMatchObject({ kind: 'chat', synthetic: true });
  });
});

describe('prompt: chat decisions are labelled for the narrator (5.3)', () => {
  const bundle = (over: Partial<EvidenceBundle>): EvidenceBundle => ({
    touchedFiles: [], blastComponents: [], keyOwners: [], constrainingDecisions: [], precedents: [], reverts: [], riskRanking: [],
    toolFindings: [], allNodeIds: new Set(), cytoscapeElements: [], ...over,
  });

  it('tells the model a decision came from a (synthetic) chat thread', () => {
    const p = buildBriefingPrompt('t', bundle({
      constrainingDecisions: [{ decisionId: 'CHAT-1', title: 'Retry budget', component: 'billing', status: 'accepted', sourceUrl: CHAT_URL, sourceKind: 'chat', synthetic: true, sourceChannel: '#payments-eng' }],
    }));
    expect(p).toContain('Source: chat thread in #payments-eng (synthetic demo data)');
    expect(p).toContain(`Link: ${CHAT_URL}`);
  });

  it('leaves non-chat decisions exactly as before', () => {
    const p = buildBriefingPrompt('t', bundle({
      constrainingDecisions: [{ decisionId: 'D', title: 'ADR', component: 'billing', status: 'active', sourceUrl: 'docs/adr/1.md', sourceKind: 'adr' }],
    }));
    expect(p).toContain('Source: docs/adr/1.md');
    expect(p).not.toContain('chat thread');
  });
});
