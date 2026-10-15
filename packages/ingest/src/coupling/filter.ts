import * as path from 'node:path';

const EXCLUDED_FILENAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'cargo.lock',
  'poetry.lock',
  'gemfile.lock',
  'composer.lock',
]);

const EXCLUDED_EXTENSIONS = new Set([
  '.min.js',
  '.min.css',
  '.map',
  '.bundle.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.pdf',
  '.wasm',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
  '.mp4',
  '.mp3',
]);

const EXCLUDED_DIR_PARTS = new Set([
  'node_modules',
  'dist',
  '.next',
  'vendor',
  '.turbo',
  'target',
  'build',
  'out',
  '.cache',
  '.git',
]);

/**
 * Filter out noise files (lockfiles, binaries, vendor bundles) from co-change analysis.
 */
export function isArchitecturalFile(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized).toLowerCase();

  // Check exact filename exclusions
  if (EXCLUDED_FILENAMES.has(basename)) {
    return false;
  }
  if (basename.endsWith('-lock.yaml') || basename.endsWith('-lock.json') || basename.endsWith('.lock')) {
    return false;
  }

  // Check extension exclusions
  for (const ext of EXCLUDED_EXTENSIONS) {
    if (basename.endsWith(ext)) {
      return false;
    }
  }

  // Check directory segments
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (EXCLUDED_DIR_PARTS.has(seg)) {
      return false;
    }
  }

  return true;
}
