import type { Briefing } from '../schemas/briefing.js';
import type { CitationValidationResult } from './types.js';

export async function validateCitationIntegrity(
  briefing: Briefing,
  evidenceNodeIds: Set<string>,
  fallbackCheck?: (id: string) => Promise<boolean>
): Promise<CitationValidationResult> {
  const verifiedIdSet = new Set<string>(evidenceNodeIds);
  const checkedCache = new Map<string, boolean>();

  async function isIdVerified(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (!trimmed) return false;

    if (verifiedIdSet.has(trimmed)) {
      return true;
    }

    if (checkedCache.has(trimmed)) {
      return checkedCache.get(trimmed)!;
    }

    if (fallbackCheck) {
      try {
        const found = await fallbackCheck(trimmed);
        if (found) {
          verifiedIdSet.add(trimmed);
          checkedCache.set(trimmed, true);
          return true;
        }
      } catch {
        // Fallback check error defaults to unverified
      }
    }

    checkedCache.set(trimmed, false);
    return false;
  }

  async function verifyIdsList(ids: string[]): Promise<boolean> {
    if (!ids || ids.length === 0) return false;
    for (const id of ids) {
      const ok = await isIdVerified(id);
      if (!ok) return false;
    }
    return true;
  }

  let totalCitedCount = 0;
  let strippedClaimCount = 0;
  const allVerifiedNodeIds = new Set<string>();

  // 1. Sanitize summary.keyTakeaways
  const sanitizedTakeaways = [];
  for (const item of briefing.summary.keyTakeaways) {
    totalCitedCount += item.citedNodeIds.length;
    const isValid = await verifyIdsList(item.citedNodeIds);
    if (isValid) {
      sanitizedTakeaways.push(item);
      item.citedNodeIds.forEach((id) => allVerifiedNodeIds.add(id));
    } else {
      strippedClaimCount++;
    }
  }

  // 2. Sanitize blastRadius.affectedComponents
  const sanitizedComponents = [];
  for (const comp of briefing.blastRadius.affectedComponents) {
    totalCitedCount += comp.citedNodeIds.length;
    const isValid = await verifyIdsList(comp.citedNodeIds);
    if (isValid) {
      sanitizedComponents.push(comp);
      comp.citedNodeIds.forEach((id) => allVerifiedNodeIds.add(id));
    } else {
      strippedClaimCount++;
    }
  }

  // 3. Sanitize keyOwners
  const sanitizedOwners = [];
  for (const owner of briefing.keyOwners) {
    totalCitedCount += owner.citedNodeIds.length;
    const isValid = await verifyIdsList(owner.citedNodeIds);
    if (isValid) {
      sanitizedOwners.push(owner);
      owner.citedNodeIds.forEach((id) => allVerifiedNodeIds.add(id));
    } else {
      strippedClaimCount++;
    }
  }

  // 4. Sanitize constrainingDecisions
  const sanitizedDecisions = [];
  for (const dec of briefing.constrainingDecisions) {
    totalCitedCount += dec.citedNodeIds.length;
    const isValid = await verifyIdsList(dec.citedNodeIds);
    if (isValid) {
      sanitizedDecisions.push(dec);
      dec.citedNodeIds.forEach((id) => allVerifiedNodeIds.add(id));
    } else {
      strippedClaimCount++;
    }
  }

  // 5. Sanitize precedents
  const sanitizedPrecedents = [];
  for (const prec of briefing.precedents) {
    totalCitedCount += prec.citedNodeIds.length;
    const isValid = await verifyIdsList(prec.citedNodeIds);
    if (isValid) {
      sanitizedPrecedents.push(prec);
      prec.citedNodeIds.forEach((id) => allVerifiedNodeIds.add(id));
    } else {
      strippedClaimCount++;
    }
  }

  const verifiedCitationCount = allVerifiedNodeIds.size;

  // Refusal check per D-14:
  // If 0 verified citations remain or all takeaways are stripped, refuse with CITATION_INTEGRITY_FAILURE
  if (verifiedCitationCount === 0 || sanitizedTakeaways.length === 0) {
    return {
      status: 'CITATION_INTEGRITY_FAILURE',
      verifiedBriefing: null,
      totalCitedCount,
      verifiedCitationCount: 0,
      strippedClaimCount,
      verifiedNodeIds: [],
      failureReason:
        'Citation integrity check failed: 0 verified graph citations found in generated output.',
    };
  }

  const sanitizedBriefing: Briefing = {
    summary: {
      ...briefing.summary,
      keyTakeaways: sanitizedTakeaways,
    },
    blastRadius: {
      ...briefing.blastRadius,
      affectedComponents: sanitizedComponents,
    },
    keyOwners: sanitizedOwners,
    constrainingDecisions: sanitizedDecisions,
    precedents: sanitizedPrecedents,
  };

  return {
    status: 'PASSED',
    verifiedBriefing: sanitizedBriefing,
    totalCitedCount,
    verifiedCitationCount,
    strippedClaimCount,
    verifiedNodeIds: Array.from(allVerifiedNodeIds),
  };
}

