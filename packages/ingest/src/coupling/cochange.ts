import { isArchitecturalFile } from './filter.js';
import { deriveComponents, resolveComponentForFile } from './components.js';
import type { GitCommit } from '../git/types.js';
import type {
  CoChangeEdge,
  CouplingOptions,
  CouplingResult,
} from './types.js';

/**
 * Computes co-change coupling matrices across files and architectural components.
 * Generates (:Component)-[:DEPENDS_ON {weight, count}]->(:Component) edges.
 */
export function computeCoChangeCoupling(
  commits: GitCommit[],
  options: CouplingOptions = {}
): CouplingResult {
  const minCoCommits = options.minCoCommits ?? 3;
  const minJaccard = options.minJaccard ?? 0.15;
  const maxFilesPerCommit = options.maxFilesPerCommit ?? 30;

  const fileCommitCounts = new Map<string, number>();
  const filePairCounts = new Map<string, number>();

  const componentCommitCounts = new Map<string, number>();
  const componentPairCounts = new Map<string, number>();

  const allFilteredFiles = new Set<string>();

  for (const commit of commits) {
    // Filter out mass refactoring / lockfile churn commits
    const architecturalFiles = Array.from(
      new Set(
        commit.files
          .map((f) => f.path)
          .filter(isArchitecturalFile)
      )
    );

    if (architecturalFiles.length === 0 || architecturalFiles.length > maxFilesPerCommit) {
      continue;
    }

    for (const file of architecturalFiles) {
      allFilteredFiles.add(file);
      fileCommitCounts.set(file, (fileCommitCounts.get(file) || 0) + 1);
    }

    // Accumulate pairwise file co-changes
    for (let i = 0; i < architecturalFiles.length; i++) {
      for (let j = i + 1; j < architecturalFiles.length; j++) {
        const fileA = architecturalFiles[i];
        const fileB = architecturalFiles[j];
        const pairKey = fileA < fileB ? `${fileA}::${fileB}` : `${fileB}::${fileA}`;
        filePairCounts.set(pairKey, (filePairCounts.get(pairKey) || 0) + 1);
      }
    }

    // Accumulate component-level co-changes
    const touchedComponents = Array.from(
      new Set(architecturalFiles.map((f) => resolveComponentForFile(f)))
    );

    for (const comp of touchedComponents) {
      componentCommitCounts.set(comp, (componentCommitCounts.get(comp) || 0) + 1);
    }

    for (let i = 0; i < touchedComponents.length; i++) {
      for (let j = i + 1; j < touchedComponents.length; j++) {
        const compA = touchedComponents[i];
        const compB = touchedComponents[j];
        const pairKey = compA < compB ? `${compA}::${compB}` : `${compB}::${compA}`;
        componentPairCounts.set(pairKey, (componentPairCounts.get(pairKey) || 0) + 1);
      }
    }
  }

  // Derive all active components
  const components = deriveComponents(Array.from(allFilteredFiles));

  // Compute file-level coupling edges
  const fileEdges: CoChangeEdge[] = [];
  for (const [pairKey, count] of filePairCounts.entries()) {
    if (count < minCoCommits) {
      continue;
    }
    const [fileA, fileB] = pairKey.split('::');
    const countA = fileCommitCounts.get(fileA) || 0;
    const countB = fileCommitCounts.get(fileB) || 0;
    const union = countA + countB - count;
    const jaccard = union > 0 ? count / union : 0;

    if (jaccard >= minJaccard) {
      fileEdges.push({
        source: fileA,
        target: fileB,
        weight: Number(jaccard.toFixed(4)),
        count,
      });
    }
  }

  // Compute component-level DEPENDS_ON edges
  const componentEdges: CoChangeEdge[] = [];
  for (const [pairKey, count] of componentPairCounts.entries()) {
    if (count < minCoCommits) {
      continue;
    }
    const [compA, compB] = pairKey.split('::');
    const countA = componentCommitCounts.get(compA) || 0;
    const countB = componentCommitCounts.get(compB) || 0;
    const union = countA + countB - count;
    const jaccard = union > 0 ? count / union : 0;

    if (jaccard >= minJaccard) {
      componentEdges.push({
        source: compA,
        target: compB,
        weight: Number(jaccard.toFixed(4)),
        count,
      });
    }
  }

  return {
    components,
    componentEdges,
    fileEdges,
  };
}
