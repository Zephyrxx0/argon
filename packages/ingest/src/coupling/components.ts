import { isArchitecturalFile } from './filter.js';
import type { ComponentDefinition } from './types.js';

const MONOREPO_ROOTS = new Set([
  'packages',
  'apps',
  'services',
  'modules',
  'libs',
  'crates',
]);

/**
 * Resolves the architectural Component name for a given file path.
 * Monorepos: 'packages/graph', 'apps/web'
 * Standard repos: 'src', 'lib', 'docs'
 * Root files: 'root'
 */
export function resolveComponentForFile(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');

  if (segments.length <= 1) {
    return 'root';
  }

  const topLevel = segments[0];

  if (MONOREPO_ROOTS.has(topLevel) && segments.length >= 2) {
    return `${topLevel}/${segments[1]}`;
  }

  return topLevel;
}

/**
 * Partitions a collection of files into distinct ComponentDefinition entities.
 */
export function deriveComponents(files: string[]): ComponentDefinition[] {
  const componentMap = new Map<string, Set<string>>();

  for (const file of files) {
    if (!isArchitecturalFile(file)) {
      continue;
    }

    const componentName = resolveComponentForFile(file);
    if (!componentMap.has(componentName)) {
      componentMap.set(componentName, new Set());
    }
    componentMap.get(componentName)!.add(file);
  }

  const components: ComponentDefinition[] = [];

  for (const [name, fileSet] of componentMap.entries()) {
    components.push({
      name,
      pathPrefix: name === 'root' ? '' : name,
      files: Array.from(fileSet).sort(),
    });
  }

  return components.sort((a, b) => a.name.localeCompare(b.name));
}
