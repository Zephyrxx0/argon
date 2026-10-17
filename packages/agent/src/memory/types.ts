export interface RecordOutcomeParams {
  workspaceId: string;
  task: string;
  summary: string;
  actorId?: string;
  contributorId?: string;
  citedNodeIds: string[];
  affectedComponents: string[];
  scopeHash?: string;
  /** Graph-driven verdict recorded with the briefing (PROCEED | REVIEW | HOLD). */
  verdict?: string;
  /** Number of graph tool calls that produced the briefing. */
  toolCallCount?: number;
}

export interface RecordOutcomeResult {
  briefingId: string;
  createdEdges: {
    cites: number;
    about: number;
    requested: number;
  };
}

