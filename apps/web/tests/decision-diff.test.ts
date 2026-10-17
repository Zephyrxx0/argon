import { describe, it, expect } from 'vitest';
import {
  buildDecisionDiffInput,
  findRelevantSupersession,
  normalizeDecisionId,
  renderDecisionDocument,
} from '@/lib/decision-diff';
import type { Supersession } from '@/app/api/workspace/[id]/supersessions/route';

const pair = (cur: string, prev: string, component = 'billing'): Supersession => ({
  current: {
    id: cur,
    title: 'Exponential Backoff with Full Jitter',
    status: 'active',
    summary: 'Mandates exponential backoff.',
    validFrom: 1685577600,
    validTo: null,
  },
  previous: {
    id: prev,
    title: 'Linear Retry with Static Backoff',
    status: 'superseded',
    summary: 'Legacy linear retry loop.',
    validFrom: 1672531200,
    validTo: 1685577600,
  },
  components: [component],
});

describe('decision diff helpers', () => {
  it('normalises citation ids from briefings', () => {
    expect(normalizeDecisionId('#d:DEC-001')).toBe('dec-001');
    expect(normalizeDecisionId('DEC-001')).toBe('dec-001');
  });

  it('renders a decision as a stable plain-text record with its validity window', () => {
    const doc = renderDecisionDocument(pair('DEC-002', 'DEC-001').previous, ['billing']);
    expect(doc).toContain('# DEC-001 · Linear Retry with Static Backoff');
    expect(doc).toContain('status:      superseded');
    expect(doc).toContain('valid_from:  2023-01-01');
    expect(doc).toContain('valid_to:    2023-06-01');
    expect(renderDecisionDocument(pair('DEC-002', 'DEC-001').current, [])).toContain('valid_to:    null');
  });

  it('builds old/new inputs under the same file name so the result reads as a modification', () => {
    const { oldFile, newFile } = buildDecisionDiffInput(pair('DEC-002', 'DEC-001'));
    expect(oldFile.name).toBe('billing/DECISION.md');
    expect(newFile.name).toBe(oldFile.name);
    expect(oldFile.contents).not.toEqual(newFile.contents);
  });

  it('finds the supersession a briefing cites, on either side of the pair', () => {
    const pairs = [pair('DEC-013', 'DEC-012', 'gateway'), pair('DEC-002', 'DEC-001')];
    expect(findRelevantSupersession(pairs, ['d:DEC-001'])).toBe(1);
    expect(findRelevantSupersession(pairs, ['#DEC-013'])).toBe(0);
    expect(findRelevantSupersession(pairs, ['DEC-999'])).toBe(-1);
    expect(findRelevantSupersession(pairs, [])).toBe(-1);
  });
});
