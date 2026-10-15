export interface RecordOutcomeParams {
  workspaceId: string;
  task: string;
  summary: string;
  actorId?: string;
  contributorId?: string;
  citedNodeIds: string[];
  affectedComponents: string[];
  scopeHash?: string;
}

export interface RecordOutcomeResult {
  briefingId: string;
  createdEdges: {
    cites: number;
    about: number;
    requested: number;
  };
}

