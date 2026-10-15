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
  component: string;
  authoredCount: number;
  reviewedCount: number;
}

export interface ConstrainingDecisionItem {
  decisionId: string;
  title: string;
  component: string;
  status: string;
  sourceUrl?: string;
  validFrom?: number;
}

export interface PrecedentItem {
  decisionId: string;
  title: string;
  similarityScore: number;
  component?: string;
  pullRequest?: string;
  summary?: string;
}

export interface EvidenceBundle {
  touchedFiles: TouchedFileItem[];
  blastComponents: BlastComponentItem[];
  keyOwners: KeyOwnerItem[];
  constrainingDecisions: ConstrainingDecisionItem[];
  precedents: PrecedentItem[];
  allNodeIds: Set<string>;
  cytoscapeElements: any[];
}

export interface RetrievalResult {
  status: 'SUCCESS' | 'NO_GRAPH_DATA';
  bundle?: EvidenceBundle;
  reason?: string;
}
