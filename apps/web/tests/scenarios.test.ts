import { describe, it, expect } from 'vitest';
import {
  buildSuggestions,
  isBriefableComponent,
  isBriefableFile,
  isSourceLike,
  SCENARIO_PRESETS,
} from '@/lib/scenarios';
import { placeholderFor } from '@/components/command/command-bar';
import type { OverviewResponse } from '@/lib/workspace-data';

const comp = (id: string, files: number) => ({
  data: { id, label: id, type: 'Component', properties: { files } },
});
const decision = (id: string, title: string, status: string) => ({
  data: { id, label: id, type: 'Decision', properties: { title, status } },
});

const overview = (over: Partial<OverviewResponse> = {}): OverviewResponse => ({
  workspaceId: 'ws',
  elements: { nodes: [], edges: [] },
  stats: { components: 0, files: 0, decisions: 0, people: 0, truncated: false },
  topFiles: [],
  ...over,
});

describe('buildSuggestions', () => {
  it('keeps the hand-written scenarios for the synthetic demo only', () => {
    const s = buildSuggestions('synthetic-demo', null);
    expect(s.curated).toBe(true);
    expect(s.scenarios).toEqual(SCENARIO_PRESETS);
    expect(buildSuggestions('ws_treads', null).curated).toBe(false);
  });

  it('derives scenarios from the workspace itself and never mentions the demo', () => {
    const s = buildSuggestions(
      'ws_treads',
      overview({
        elements: {
          nodes: [comp('app', 23), comp('lib', 16), comp('hooks', 4)],
          edges: [],
        },
        topFiles: [
          { path: 'lib/utils.ts', component: 'lib', touches: 9 },
          { path: 'app/page.tsx', component: 'app', touches: 4 },
        ],
      })
    );
    expect(s.scenarios.map((x) => x.id)).toEqual(['s1-blast-radius', 's2-onboarding-path', 's3-architectural-precedent']);
    expect(s.scenarios[0]!.query).toBe('Refactor lib/utils.ts');
    // onboarding picks the biggest component that S1 has not already used
    expect(s.scenarios[1]!.query).toBe('I want to work on the app component');
    expect(s.scenarios[2]!.query).toBe('What depends on hooks?');
    const all = JSON.stringify(s);
    expect(all).not.toMatch(/billing|legacy-sync|BillingEngine/i);
    // palette entries are real components and files of this workspace
    expect(s.entities.map((e) => e.query)).toEqual(['app', 'lib', 'hooks', 'lib/utils.ts', 'app/page.tsx']);
  });

  it('uses a superseded decision for the precedent scenario when there is one', () => {
    const s = buildSuggestions(
      'ws',
      overview({
        elements: {
          nodes: [comp('routing', 3), decision('RFC-1', 'Old routing?', 'superseded'), decision('RFC-2', 'New', 'active')],
          edges: [{ data: { id: 'g', source: 'RFC-1', target: 'routing', label: 'GOVERNS', properties: {} } }],
        },
      })
    );
    const precedent = s.scenarios.find((x) => x.id === 's3-architectural-precedent')!;
    expect(precedent.title).toBe('Why was `Old routing` replaced?');
    expect(precedent.query).toBe('Why was Old routing replaced in routing?');
  });

  it('falls back to a decision constraint, then to nothing: never invents content', () => {
    const only = buildSuggestions('ws', overview({ elements: { nodes: [comp('a', 1), decision('D', 'Use X', 'active')], edges: [] } }));
    expect(only.scenarios.find((x) => x.id === 's3-architectural-precedent')!.query).toBe('What does Use X constrain?');

    const empty = buildSuggestions('ws', overview());
    expect(empty.scenarios).toEqual([]);
    expect(empty.entities).toEqual([]);
    expect(buildSuggestions('ws', null).scenarios).toEqual([]);
  });

  it('skips names the briefing resolver could not recognise', () => {
    expect(isBriefableFile('src/a.ts')).toBe(true);
    expect(isBriefableFile('Makefile')).toBe(false);
    expect(isBriefableFile('img/logo.png')).toBe(false);
    expect(isBriefableComponent('lib')).toBe(true);
    expect(isBriefableComponent('apps/web')).toBe(false);
    expect(isBriefableComponent('my component')).toBe(false);

    const s = buildSuggestions(
      'ws',
      overview({
        elements: { nodes: [comp('apps/web', 9), comp('core', 3)], edges: [] },
        topFiles: [{ path: 'logo.png', component: 'core', touches: 5 }],
      })
    );
    expect(s.entities.map((e) => e.query)).toEqual(['core']);
    expect(s.scenarios[0]!.query).toBe('Refactor core');
  });

  it('prefers source files over docs, config and dot-folders as examples', () => {
    expect(isSourceLike('lib/utils.ts')).toBe(true);
    expect(isSourceLike('.planning/STATE.md')).toBe(false);
    expect(isSourceLike('README.md')).toBe(false);
    expect(isSourceLike('package.json')).toBe(false);
    expect(isSourceLike('.github/workflows/ci.yml')).toBe(false);

    const s = buildSuggestions(
      'ws',
      overview({
        elements: { nodes: [comp('lib', 3)], edges: [] },
        topFiles: [
          { path: '.planning/STATE.md', component: '.planning', touches: 50 },
          { path: 'README.md', component: null, touches: 30 },
          { path: 'lib/utils.ts', component: 'lib', touches: 5 },
        ],
      })
    );
    expect(s.scenarios[0]!.query).toBe('Refactor lib/utils.ts');
    expect(s.entities.filter((e) => e.type === 'file').map((e) => e.query)).toEqual([
      'lib/utils.ts',
      '.planning/STATE.md',
      'README.md',
    ]);

    // with no source files at all, docs are still better than nothing
    const docsOnly = buildSuggestions(
      'ws',
      overview({ topFiles: [{ path: 'README.md', component: null, touches: 2 }] })
    );
    expect(docsOnly.scenarios[0]!.query).toBe('Refactor README.md');
  });

  it('does not pick dot-folders (tooling/planning) as the example component', () => {
    const s = buildSuggestions(
      'ws',
      overview({ elements: { nodes: [comp('.planning', 80), comp('app', 23), comp('lib', 16)], edges: [] } })
    );
    expect(s.scenarios[0]!.query).toBe('Refactor app');
    expect(s.scenarios[1]!.query).toBe('I want to work on the lib component');
    expect(s.entities.map((e) => e.query)).toEqual(['app', 'lib', '.planning']);
  });

  it('derives the command-bar placeholder from the workspace', () => {
    expect(placeholderFor(undefined)).toMatch(/billing\/retry\.ts/);
    expect(placeholderFor(buildSuggestions('synthetic-demo', null))).toMatch(/billing\/retry\.ts/);
    const s = buildSuggestions(
      'ws_treads',
      overview({ elements: { nodes: [comp('lib', 3)], edges: [] }, topFiles: [{ path: 'lib/utils.ts', component: 'lib', touches: 1 }] })
    );
    expect(placeholderFor(s)).toBe('Search scope (e.g. lib, lib/utils.ts)...');
    expect(placeholderFor(buildSuggestions('x', null))).toMatch(/file path, a component name/);
  });
});
