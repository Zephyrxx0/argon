export interface MinedDecision {
  id: string;
  title: string;
  status: 'accepted' | 'superseded' | 'proposed';
  valid_from: number; // epoch seconds
  valid_to: number | null; // epoch seconds or null if active
  source_url: string;
  source_kind: 'adr' | 'rfc' | 'commit' | 'pr' | 'doc';
  summary: string;
  raw_text: string;
  embedding?: number[];
  supersedes_id?: string;
  component_name?: string;
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
