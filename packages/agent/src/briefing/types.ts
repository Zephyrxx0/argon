import type { ToolTraceEntry } from '../tools/trace.js';

export interface BriefingScopeInput {
  task: string;
  files?: string[];
  components?: string[];
  asOf?: number;
  contributorId?: string;
  anonymousSessionId?: string;
}

export interface ResolvedScope {
  files: string[];
  components: string[];
  queryVector: number[];
  rawTask: string;
  asOf: number;
  contributorId?: string;
  anonymousSessionId?: string;
}

export interface TouchedFileItem {
  path: string;
  component?: string;
}

export interface BlastComponentItem {
  component: string;
  downstreamOf?: string;
  depth?: number;
}

export interface KeyOwnerItem {
  personId: string;
  name: string;
  /** The component (in scope) where this person's activity is highest. */
  component: string;
  /** Distinct PRs/commits authored, summed over the scoped components. */
  authoredCount: number;
  /** Distinct PRs reviewed, summed over the scoped components (0 when no review data was ingested). */
  reviewedCount: number;
  /** True when CODEOWNERS also names this person as owner of record. */
  isCodeOwner?: boolean;
}

/** Owner of record for a component, from CODEOWNERS (a person or a team). */
export interface CodeOwnerItem {
  ownerId: string;
  name: string;
  component: string;
  /** The CODEOWNERS pattern that assigned the ownership. */
  pattern?: string;
  kind: 'person' | 'team';
}

/**
 * A clickable origin for a cited graph node: the commit, ADR, pull request or issue a fact came
 * from. Built from graph properties only (never from model output), so it cannot be hallucinated.
 */
export interface EvidenceSource {
  /** Graph node id this source describes (citable when present in the evidence). */
  nodeId: string;
  kind: 'decision' | 'commit' | 'document' | 'pull_request' | 'issue';
  label: string;
  /** Absolute http(s) URL, only when the graph holds one. */
  url?: string;
  state?: string;
  /** The decision/precedent/revert node this source is the provenance of. */
  relatedTo?: string;
}

export interface ConstrainingDecisionItem {
  decisionId: string;
  title: string;
  component: string;
  status: string;
  sourceUrl?: string;
  validFrom?: number;
  /** Pull request the decision was extracted from (graph node id and display number), if known. */
  pullRequestId?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  /** Issue that pull request closes, if known. */
  issueId?: string;
  issueNumber?: number;
  issueUrl?: string;
}

export interface PrecedentItem {
  decisionId: string;
  title: string;
  similarityScore: number;
  component?: string;
  /** Display reference of the originating PR: "#12" for a GitHub PR, else the commit node id. */
  pullRequest?: string;
  pullRequestId?: string;
  pullRequestUrl?: string;
  issueId?: string;
  issueNumber?: number;
  issueUrl?: string;
  summary?: string;
  /** Lifecycle status of the precedent decision in the graph (e.g. active / superseded). */
  status?: string;
}

export interface RevertItem {
  /** Graph id of the revert commit/PR node (citable). */
  id: string;
  title?: string;
  revertedId?: string;
  files: string[];
  /** GitHub PR number / URL when the revert commit was matched to a pull request. */
  number?: number;
  url?: string;
}

export interface RiskRankItem {
  component: string;
  score: number;
}

/** Output of an extra tool the LLM planner chose to run. */
export interface ToolFinding {
  tool: string;
  args: Record<string, unknown>;
  rowCount: number;
  primaryIds: string[];
  /** Compact JSON preview of the rows (bounded). */
  preview: string;
}

export interface EvidenceBundle {
  touchedFiles: TouchedFileItem[];
  blastComponents: BlastComponentItem[];
  keyOwners: KeyOwnerItem[];
  constrainingDecisions: ConstrainingDecisionItem[];
  precedents: PrecedentItem[];
  reverts: RevertItem[];
  riskRanking: RiskRankItem[];
  /** Owners of record from CODEOWNERS for the components in scope. */
  codeOwners?: CodeOwnerItem[];
  /** Clickable provenance (commit / ADR / PR / issue links) for cited nodes. */
  sources?: EvidenceSource[];
  toolFindings: ToolFinding[];
  allNodeIds: Set<string>;
  cytoscapeElements: any[];
}

export interface RetrievalResult {
  status: 'SUCCESS' | 'NO_GRAPH_DATA';
  bundle?: EvidenceBundle;
  reason?: string;
  /** Every graph query the pipeline ran (or skipped) while retrieving evidence. */
  trace: ToolTraceEntry[];
}

