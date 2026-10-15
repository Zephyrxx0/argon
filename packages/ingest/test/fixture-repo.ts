import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { simpleGit, SimpleGit } from 'simple-git';

export interface FixtureRepoResult {
  dir: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a deterministic programmatic git fixture repository for end-to-end testing.
 */
export async function createFixtureRepository(): Promise<FixtureRepoResult> {
  const dir = path.join(os.tmpdir(), 'argon-fixture-' + randomUUID());
  await fs.promises.mkdir(dir, { recursive: true });

  const git: SimpleGit = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'Alice Contributor');
  await git.addConfig('user.email', 'alice@company.com');

  // Add .mailmap
  await fs.promises.writeFile(
    path.join(dir, '.mailmap'),
    'Alice C <alice@company.com> Alice Contributor <alice@company.com>\n'
  );

  // Commit 1: Initial core package and ADR-001
  const coreDir = path.join(dir, 'packages/core/src');
  const adrDir = path.join(dir, 'docs/adr');
  await fs.promises.mkdir(coreDir, { recursive: true });
  await fs.promises.mkdir(adrDir, { recursive: true });

  await fs.promises.writeFile(
    path.join(coreDir, 'index.ts'),
    'export const CORE_VERSION = "1.0.0";\n'
  );

  await fs.promises.writeFile(
    path.join(adrDir, '001-database.md'),
    `---
title: "ADR-001: Initial Database Choice"
status: "accepted"
---
# ADR-001: Initial Database Choice
Status: accepted
We initially chose Neo4j.
`
  );

  await git.add(['.mailmap', 'packages/core/src/index.ts', 'docs/adr/001-database.md']);
  await git.commit('feat: initialize core and ADR-001');

  // Commit 2: Utils package
  const utilsDir = path.join(dir, 'packages/utils/src');
  await fs.promises.mkdir(utilsDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(utilsDir, 'helper.ts'),
    'export const helper = () => true;\n'
  );
  await git.add('packages/utils/src/helper.ts');
  await git.commit('feat: initialize utils package');

  // Commits 3-6: Co-changes between packages/core and packages/utils
  for (let i = 1; i <= 4; i++) {
    await fs.promises.appendFile(
      path.join(coreDir, 'index.ts'),
      `export const coreFunc${i} = () => ${i};\n`
    );
    await fs.promises.appendFile(
      path.join(utilsDir, 'helper.ts'),
      `export const utilFunc${i} = () => ${i};\n`
    );
    await git.add(['packages/core/src/index.ts', 'packages/utils/src/helper.ts']);
    await git.commit(`feat(core): co-change integration step ${i}`);
  }

  // Commit 7: Feature to be reverted
  await fs.promises.writeFile(
    path.join(coreDir, 'broken.ts'),
    'export const broken = () => { throw new Error(); };\n'
  );
  await git.add('packages/core/src/broken.ts');
  const brokenCommit = await git.commit('feat: add broken experimental feature');

  // Commit 8: Git Revert commit
  await fs.promises.rm(path.join(coreDir, 'broken.ts'));
  await git.add('packages/core/src/broken.ts');
  await git.commit(`Revert "feat: add broken experimental feature"\n\nThis reverts commit ${brokenCommit.commit}.`);

  // Commit 9: Architectural commit superseding ADR-001 with ADR-002
  await fs.promises.writeFile(
    path.join(adrDir, '002-falkordb.md'),
    `---
title: "ADR-002: Migrate to FalkorDB"
status: "accepted"
supersedes: "ADR-001"
---
# ADR-002: Migrate to FalkorDB
Status: accepted
We migrate from Neo4j to FalkorDB for vector indexing.
`
  );
  await git.add('docs/adr/002-falkordb.md');
  await git.commit('feat: supersede ADR-001 with FalkorDB migration ADR-002');

  const cleanup = async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  };

  return {
    dir,
    cleanup,
  };
}
