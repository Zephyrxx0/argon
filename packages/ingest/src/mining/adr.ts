import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { MinedDecision, SupersessionLink } from './types.js';

/**
 * Parses markdown frontmatter and headers to extract ADR/RFC metadata.
 */
export function parseAdrDocument(
  filePath: string,
  content: string,
  fileTimestamp: number
): MinedDecision | null {
  if (!content || !content.trim()) {
    return null;
  }

  const lines = content.split('\n');
  let title = '';
  let status: 'accepted' | 'superseded' | 'proposed' = 'accepted';
  let supersedesRef = '';
  let bodyLines: string[] = [];

  let inFrontmatter = false;
  let frontmatterLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === '---') {
        inFrontmatter = false;
        continue;
      }
      frontmatterLines.push(line);
      continue;
    }

    // Extract title from first markdown H1 if not in frontmatter
    if (!title && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }

    bodyLines.push(lines[i]);
  }

  // Parse frontmatter keys if present
  for (const fm of frontmatterLines) {
    const match = fm.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (match) {
      const key = match[1].toLowerCase();
      const val = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
      if (key === 'title' && !title) {
        title = val;
      } else if (key === 'status') {
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('supersed')) status = 'superseded';
        else if (lowerVal.includes('propos') || lowerVal.includes('draft')) status = 'proposed';
        else status = 'accepted';
      } else if (key === 'supersedes' || key === 'replaces') {
        supersedesRef = val;
      }
    }
  }

  // If status not found in frontmatter, scan body for "Status: ..." or "## Status"
  const bodyText = bodyLines.join('\n');
  const statusMatch = bodyText.match(/(?:##\s*Status|\*\*Status:\*\*|Status:)\s*([^\n\r]+)/i);
  if (statusMatch) {
    const statusText = statusMatch[1].toLowerCase();
    if (statusText.includes('supersed')) status = 'superseded';
    else if (statusText.includes('propos') || statusText.includes('draft')) status = 'proposed';
    else if (statusText.includes('accept')) status = 'accepted';
  }

  // Check for supersedes in body
  const supersedesMatch = bodyText.match(/(?:supersedes|replaces|superseded by)\s*[:\s]*([^\n\r.]+)/i);
  if (!supersedesRef && supersedesMatch) {
    supersedesRef = supersedesMatch[1].trim();
  }

  if (!title) {
    title = path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, ' ');
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  const idHash = createHash('sha256').update(normalizedPath).digest('hex').slice(0, 16);
  const id = `dec_adr_${idHash}`;

  // Extract a 1-2 sentence summary from beginning of body
  const nonHeaderLines = bodyLines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('---'));
  const summary = nonHeaderLines.slice(0, 3).join(' ').slice(0, 300) || title;

  return {
    id,
    title,
    status,
    valid_from: fileTimestamp,
    valid_to: null,
    source_url: normalizedPath,
    source_kind: normalizedPath.includes('rfc') ? 'rfc' : 'adr',
    summary,
    raw_text: content.slice(0, 4000),
    supersedes_id: supersedesRef || undefined,
    origin_path: normalizedPath,
  };
}

/**
 * Resolves supersessions between decisions, updating predecessor valid_to and generating links.
 */
export function resolveSupersessions(decisions: MinedDecision[]): {
  decisions: MinedDecision[];
  supersedesLinks: SupersessionLink[];
} {
  const links: SupersessionLink[] = [];
  const decisionMap = new Map<string, MinedDecision>();
  const titleMap = new Map<string, MinedDecision>();

  for (const d of decisions) {
    decisionMap.set(d.id, d);
    titleMap.set(d.title.toLowerCase().trim(), d);
  }

  for (const current of decisions) {
    if (!current.supersedes_id) {
      continue;
    }

    const ref = current.supersedes_id.toLowerCase().trim();
    // Try matching by exact ID, title, or filename fragment
    let target = decisionMap.get(ref) || titleMap.get(ref);

    if (!target) {
      // Try substring match on source_url or title
      for (const candidate of decisions) {
        if (
          candidate.id !== current.id &&
          (candidate.source_url.toLowerCase().includes(ref) ||
            candidate.title.toLowerCase().includes(ref))
        ) {
          target = candidate;
          break;
        }
      }
    }

    if (target && target.id !== current.id) {
      // Update target decision temporal validity
      target.valid_to = current.valid_from;
      target.status = 'superseded';

      links.push({
        source_id: current.id,
        target_id: target.id,
      });
    }
  }

  return {
    decisions,
    supersedesLinks: links,
  };
}

/**
 * Scans a repository directory for ADR and RFC markdown documents.
 */
export async function scanAdrFiles(repoPath: string): Promise<MinedDecision[]> {
  const decisions: MinedDecision[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === '.next'
        ) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const lower = relPath.toLowerCase();
        const isAdrPath =
          lower.includes('/adr/') ||
          lower.includes('/adrs/') ||
          lower.includes('/rfcs/') ||
          lower.includes('/decisions/') ||
          lower.includes('/docs/arch') ||
          lower.includes('-adr-') ||
          lower.startsWith('adr/') ||
          lower.startsWith('rfcs/');

        if (isAdrPath) {
          try {
            const content = await fs.promises.readFile(fullPath, 'utf8');
            const stat = await fs.promises.stat(fullPath);
            const timestamp = Math.floor(stat.mtimeMs / 1000);
            const decision = parseAdrDocument(relPath, content, timestamp);
            if (decision) {
              decisions.push(decision);
            }
          } catch {
            // Ignore unreadable file
          }
        }
      }
    }
  }

  await walk(repoPath);
  return decisions;
}
