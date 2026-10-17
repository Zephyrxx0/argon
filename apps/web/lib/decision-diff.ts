import type { Supersession, DecisionSnapshot } from '@/app/api/workspace/[id]/supersessions/route';

const toDate = (epochSeconds: number | null) =>
  epochSeconds == null ? 'null' : new Date(epochSeconds * 1000).toISOString().slice(0, 10);

/** Stable id comparison: briefing citations look like `d:DEC-001` / `#DEC-001`. */
export function normalizeDecisionId(id: string): string {
  return id.replace(/^#/, '').replace(/^d:/i, '').trim().toLowerCase();
}

/**
 * Renders a decision as a small plain-text record so that a supersession reads as a
 * real diff: status flips, validity window closes, and the constraint text changes.
 */
export function renderDecisionDocument(decision: DecisionSnapshot, components: string[]): string {
  return [
    `# ${decision.id} · ${decision.title}`,
    '',
    `status:      ${decision.status}`,
    `governs:     ${components.length > 0 ? components.join(', ') : '-'}`,
    `valid_from:  ${toDate(decision.validFrom)}`,
    `valid_to:    ${toDate(decision.validTo)}`,
    '',
    decision.summary || '(no summary recorded)',
    '',
  ].join('\n');
}

export function supersessionFileName(pair: Supersession): string {
  const scope = pair.components[0] ?? 'decisions';
  return `${scope}/DECISION.md`;
}

export function buildDecisionDiffInput(pair: Supersession) {
  const name = supersessionFileName(pair);
  return {
    oldFile: { name, contents: renderDecisionDocument(pair.previous, pair.components) },
    newFile: { name, contents: renderDecisionDocument(pair.current, pair.components) },
  };
}

/**
 * Index of the supersession a briefing is talking about, matched by any cited
 * precedent/decision id on either side of the pair. Returns -1 when nothing matches.
 */
export function findRelevantSupersession(pairs: Supersession[], citedDecisionIds: string[]): number {
  const cited = new Set(citedDecisionIds.map(normalizeDecisionId));
  if (cited.size === 0) return -1;
  return pairs.findIndex(
    (p) =>
      cited.has(normalizeDecisionId(p.previous.id)) || cited.has(normalizeDecisionId(p.current.id))
  );
}
