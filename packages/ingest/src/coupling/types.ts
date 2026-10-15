export interface ComponentDefinition {
  name: string;
  pathPrefix: string;
  files: string[];
}

export interface CoChangeEdge {
  source: string;
  target: string;
  weight: number; // Jaccard similarity (0.0 to 1.0)
  count: number;  // Number of shared co-commits
}

export interface CouplingOptions {
  minCoCommits?: number;
  minJaccard?: number;
  maxFilesPerCommit?: number;
}

export interface CouplingResult {
  components: ComponentDefinition[];
  componentEdges: CoChangeEdge[];
  fileEdges: CoChangeEdge[];
}
