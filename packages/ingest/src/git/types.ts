export interface CloneOptions {
  targetDir?: string;
  branch?: string;
  depth?: number;
  blobless?: boolean;
  keepClone?: boolean;
  installationToken?: string;
}

export interface CloneResult {
  dir: string;
  cleanup: () => Promise<void>;
}

export interface CanonicalAuthor {
  name: string;
  email: string;
}

export interface ResolvedAuthor {
  id: string; // SHA-256 hash of canonical email
  name: string;
  emailHash: string;
}

export interface GitFileChange {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | 'unknown';
}

export interface GitCommit {
  hash: string;
  message: string;
  summary: string;
  author: ResolvedAuthor;
  timestamp: number; // epoch seconds
  parents: string[];
  files: GitFileChange[];
}

export interface LogOptions {
  maxCommits?: number;
  since?: string;
}

export interface ExtractedRepoData {
  repoPath: string;
  commits: GitCommit[];
  authors: Map<string, ResolvedAuthor>;
  files: Set<string>;
}
