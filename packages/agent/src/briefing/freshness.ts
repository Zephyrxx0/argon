/**
 * Freshness signalling (5.4): how old is the guidance a briefing relies on?
 *
 * Derived only from facts the graph already returned (a decision's `valid_from`) and the clock,
 * so it needs no extra query and no model. `valid_from` is when the decision took effect, the
 * closest thing the graph has to "last touched": a decision that has been in force for a long
 * time without being superseded may be fine, but deserves a second look. The signal says exactly
 * that, and nothing stronger.
 */

export const STALE_AFTER_DAYS = 180;

const DAY_SECONDS = 86_400;

export interface DecisionFreshness {
  decisionId: string;
  /** Whole days the decision has been in force; null when the graph holds no `valid_from`. */
  ageDays: number | null;
  /** True when ageDays is known and exceeds `staleAfterDays`. */
  stale: boolean;
}

export interface FreshnessSummary {
  staleAfterDays: number;
  /** Cited decisions whose age is known: the "M" in "N of M". */
  citedWithKnownAge: number;
  /** How many of those are older than `staleAfterDays`: the "N". */
  staleCited: number;
  /** Age in days of the oldest cited decision with a known age. */
  oldestCitedAgeDays: number | null;
  /** One human-readable line for the UI / MCP output. */
  message: string;
  /** Per-decision ages for every decision in the evidence (cited or not), keyed by decision id. */
  decisions: DecisionFreshness[];
}

/** Stored timestamps are epoch seconds (ingest) but may be milliseconds: both are accepted. */
export function toEpochSeconds(value: number): number {
  return value > 100_000_000_000 ? Math.floor(value / 1000) : value;
}

export function ageInDays(validFrom: number | null | undefined, now: number): number | null {
  if (validFrom == null || !Number.isFinite(validFrom) || validFrom <= 0) return null;
  const nowSeconds = toEpochSeconds(now);
  return Math.max(0, Math.floor((nowSeconds - toEpochSeconds(validFrom)) / DAY_SECONDS));
}

export interface FreshnessInput {
  decisionId: string;
  /** Epoch seconds (or ms) the decision took effect. */
  validFrom?: number;
  status?: string;
}

/**
 * @param decisions  in-force decisions plus precedents found for the task
 * @param citedIds   node ids the verified briefing cites; only these count towards the summary
 * @param now        reference time (epoch seconds or ms): "now", or the `asOf` of a time-travel query
 */
export function computeFreshness(
  decisions: FreshnessInput[],
  citedIds: Iterable<string>,
  now: number,
  staleAfterDays = STALE_AFTER_DAYS
): FreshnessSummary | undefined {
  const cited = new Set(citedIds);
  const seen = new Map<string, DecisionFreshness>();
  for (const d of decisions) {
    if (seen.has(d.decisionId)) continue;
    const ageDays = ageInDays(d.validFrom, now);
    seen.set(d.decisionId, { decisionId: d.decisionId, ageDays, stale: ageDays !== null && ageDays > staleAfterDays });
  }
  if (seen.size === 0) return undefined;

  // A superseded precedent is old by definition and already flagged as retired: it does not say
  // anything about how current the guidance in force is.
  const retired = new Set(decisions.filter((d) => (d.status ?? '').toLowerCase() === 'superseded').map((d) => d.decisionId));
  const counted = [...seen.values()].filter((d) => cited.has(d.decisionId) && !retired.has(d.decisionId) && d.ageDays !== null);
  const staleCited = counted.filter((d) => d.stale).length;
  const oldest = counted.reduce<number | null>((max, d) => (max === null || d.ageDays! > max ? d.ageDays : max), null);

  let message: string;
  if (counted.length === 0) {
    message = 'No cited decision carries a date, so freshness is unknown.';
  } else if (staleCited === 0) {
    message = `All ${counted.length} cited decision${counted.length === 1 ? ' is' : 's are'} recent (in force for ${staleAfterDays} days or less).`;
  } else {
    message = `${staleCited} of ${counted.length} cited decision${counted.length === 1 ? ' has' : 's have'} been in force for more than ${staleAfterDays} days (oldest: ${oldest} days). Check they still hold.`;
  }

  return {
    staleAfterDays,
    citedWithKnownAge: counted.length,
    staleCited,
    oldestCitedAgeDays: oldest,
    message,
    decisions: [...seen.values()],
  };
}
