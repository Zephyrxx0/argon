export interface MinedDecision {
  id: string;
  title: string;
  status: 'accepted' | 'superseded' | 'proposed';
  valid_from: number; // epoch seconds
  valid_to: number | null; // epoch seconds or null if active
  source_url: string;
  source_kind: 'adr' | 'rfc' | 'commit' | 'pr' | 'doc' | 'comment' | 'chat';
  summary: string;
  raw_text: string;
  embedding?: number[];
  supersedes_id?: string;
  component_name?: string;
  /**
   * Where the decision was found. Never stored on the Decision node itself: used to write the
   * `(Decision)-[:EXTRACTED_FROM]->(PullRequest)` provenance edge and a clickable `source_url`.
   */
  origin_commit?: string; // full git hash of the commit whose message is the decision
  origin_path?: string; // repo-relative path of the ADR / RFC document
  origin_pr?: string; // PullRequest node id (e.g. a decision made in a PR review comment)
}

export interface RevertLink {
  revert_commit_hash: string;
  reverted_commit_hash: string;
  revert_title?: string;
  reverted_title?: string;
}

export interface SupersessionLink {
  source_id: string; // The newer decision that supersedes
  target_id: string; // The older decision being superseded
}

export interface MinedData {
  decisions: MinedDecision[];
  reverts: RevertLink[];
  supersessions: SupersessionLink[];
}
