export {
  ArgonGraphClient,
  FalkorUnavailableError,
  type ArgonClientConfig,
} from './client';

export { initWorkspaceGraph } from './schema/init';

export {
  toCytoscapeElements,
  type CytoscapeElements,
  type CytoscapeNodeData,
  type CytoscapeEdgeData,
  type DualPayload,
} from './transformers/cytoscape';

export * from './queries';
export {
  checkWorkspaceAccess,
  setUserWorkspaceAccess,
  migrateGuestAccess,
  type WorkspaceAccessResult,
  type SetUserWorkspaceAccessParams,
  type MigrateGuestAccessParams,
} from './queries/auth';

export {
  ArgonEmbedder,
  formatInput,
  processMatryoshkaVector,
  cosineSimilarity,
} from './embedding/embedder';

export type {
  EmbeddingProvider,
  EmbedderConfig,
  EmbedResult,
} from './embedding/types';
