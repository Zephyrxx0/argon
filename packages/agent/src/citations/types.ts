import type { Briefing } from '../schemas/briefing.js';

export type CitationValidationStatus = 'PASSED' | 'CITATION_INTEGRITY_FAILURE';

export interface CitationValidationResult {
  status: CitationValidationStatus;
  verifiedBriefing: Briefing | null;
  totalCitedCount: number;
  verifiedCitationCount: number;
  strippedClaimCount: number;
  verifiedNodeIds: string[];
  failureReason?: string;
}

