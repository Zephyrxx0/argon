import type { OverviewResponse } from '@/lib/workspace-data';

export interface ScenarioPreset {
  id: string;
  badge: string;
  title: string;
  query: string;
  description: string;
  iconName: 'git-fork' | 'layers' | 'book-open';
  accentColor: string;
}

export interface PaletteEntity {
  type: 'file' | 'component';
  label: string;
  query: string;
  desc: string;
}

export interface WorkspaceSuggestions {
  /** true when the scenarios are hand-written for this workspace rather than derived */
  curated: boolean;
  scenarios: ScenarioPreset[];
  entities: PaletteEntity[];
}

const ACCENT = 'text-accent border-accent/40';

/**
 * Hand-written scenarios for workspaces whose story is known (the synthetic demo walks
 * through the README scenarios S1-S3). Every other workspace gets scenarios derived from its
 * own graph, so a suggestion can never point at something that does not exist there.
 */
export const CURATED_SCENARIOS: Record<string, ScenarioPreset[]> = {
  'synthetic-demo': [
    {
      id: 's1-blast-radius',
      badge: 'BLAST RADIUS & OWNERS',
      title: 'Refactor `billing/retry.ts`',
      query: 'Refactor billing/retry.ts',
      description: 'Analyze file blast radius, co-change coupling, and key component owners.',
      iconName: 'git-fork',
      accentColor: ACCENT,
    },
    {
      id: 's2-onboarding-path',
      badge: 'ONBOARDING PATH',
      title: 'I want to work on the auth layer',
      query: 'I want to work on the auth layer',
      description: 'Compute learning path from familiar components to auth decisions and experts.',
      iconName: 'layers',
      accentColor: ACCENT,
    },
    {
      id: 's3-architectural-precedent',
      badge: 'ARCHITECTURAL PRECEDENT',
      title: 'Why does `legacy-sync` exist?',
      query: 'Why does legacy-sync exist?',
      description: 'Trace the governing decisions, RFCs, and supersession timeline.',
      iconName: 'book-open',
      accentColor: ACCENT,
    },
  ],
};

/** Back-compat: the default curated trio (used by tests / storybook). */
export const SCENARIO_PRESETS: ScenarioPreset[] = CURATED_SCENARIOS['synthetic-demo']!;

// What the briefing resolver can recognise as a file inside free text (see packages/agent resolver).
const BRIEFABLE_FILE = /^[A-Za-z0-9_\-./@]+\.(?:ts|tsx|js|jsx|py|go|rs|md|json|cypher|yml|yaml|css|html)$/;
// Bare words are matched against component names, so the name must survive tokenisation intact.
const BRIEFABLE_COMPONENT = /^[A-Za-z0-9_.@-]+$/;

export const isBriefableFile = (path: string) => BRIEFABLE_FILE.test(path);
const DOC_OR_CONFIG = /\.(?:md|json|ya?ml|lock|css|html|cypher)$/i;

/** Source code (not docs, config or tooling folders like `.planning/`) makes the best example. */
export const isSourceLike = (path: string) =>
  !path.split('/').some((segment) => segment.startsWith('.')) && !DOC_OR_CONFIG.test(path);

export const isBriefableComponent = (name: string) => BRIEFABLE_COMPONENT.test(name);

interface ComponentInfo {
  name: string;
  files: number;
}

/**
 * Suggestions for one workspace, derived from its overview. Pure and deterministic.
 * Returns no scenarios (rather than made-up ones) when the graph has nothing to suggest.
 */
export function buildSuggestions(workspaceId: string, overview: OverviewResponse | null): WorkspaceSuggestions {
  const curated = CURATED_SCENARIOS[workspaceId];
  const nodes = overview?.elements.nodes ?? [];
  const edges = overview?.elements.edges ?? [];

  const components: ComponentInfo[] = nodes
    .filter((n) => n.data.type === 'Component' && isBriefableComponent(n.data.id))
    .map((n) => ({ name: n.data.id, files: Number(n.data.properties.files ?? 0) }))
    // tooling/planning folders (.planning, .github...) are valid components but poor examples
    .sort(
      (a, b) =>
        Number(a.name.startsWith('.')) - Number(b.name.startsWith('.')) ||
        b.files - a.files ||
        a.name.localeCompare(b.name)
    );

  // Most-changed first, but real source files ahead of docs/config (stable within each group)
  const briefable = (overview?.topFiles ?? []).filter((f) => isBriefableFile(f.path));
  const files = [...briefable.filter((f) => isSourceLike(f.path)), ...briefable.filter((f) => !isSourceLike(f.path))];

  const entities: PaletteEntity[] = [
    ...components.slice(0, 15).map((c) => ({
      type: 'component' as const,
      label: c.name,
      query: c.name,
      desc: `${c.files} file${c.files === 1 ? '' : 's'}`,
    })),
    ...files.slice(0, 15).map((f) => ({
      type: 'file' as const,
      label: f.path,
      query: f.path,
      desc: f.component ? `in ${f.component} · ${f.touches} PR${f.touches === 1 ? '' : 's'}` : `${f.touches} PRs`,
    })),
  ];

  if (curated) return { curated: true, scenarios: curated, entities };

  const scenarios: ScenarioPreset[] = [];
  const usedComponents = new Set<string>();

  // S1: blast radius of the most-changed file (or, failing that, of the biggest component)
  const hotFile = files[0];
  if (hotFile) {
    if (hotFile.component) usedComponents.add(hotFile.component);
    scenarios.push({
      id: 's1-blast-radius',
      badge: 'BLAST RADIUS & OWNERS',
      title: `Refactor \`${hotFile.path}\``,
      query: `Refactor ${hotFile.path}`,
      description: `The most-changed file here (${hotFile.touches} PR${hotFile.touches === 1 ? '' : 's'}). See what depends on it and who knows it.`,
      iconName: 'git-fork',
      accentColor: ACCENT,
    });
  } else if (components[0]) {
    usedComponents.add(components[0].name);
    scenarios.push({
      id: 's1-blast-radius',
      badge: 'BLAST RADIUS & OWNERS',
      title: `Refactor the \`${components[0].name}\` component`,
      query: `Refactor ${components[0].name}`,
      description: 'Analyze blast radius, coupling and key owners of the largest component.',
      iconName: 'git-fork',
      accentColor: ACCENT,
    });
  }

  // S2: onboarding into the biggest component not already used above
  const onboard = components.find((c) => !usedComponents.has(c.name)) ?? components[0];
  if (onboard) {
    usedComponents.add(onboard.name);
    scenarios.push({
      id: 's2-onboarding-path',
      badge: 'ONBOARDING PATH',
      title: `I want to work on the ${onboard.name} component`,
      query: `I want to work on the ${onboard.name} component`,
      description: `${onboard.files} file${onboard.files === 1 ? '' : 's'}. Who owns it, what constrains it, what it depends on.`,
      iconName: 'layers',
      accentColor: ACCENT,
    });
  }

  // S3: precedent. Prefer a decision that was replaced; the component keeps retrieval grounded.
  const decisionNodes = nodes.filter((n) => n.data.type === 'Decision');
  const governs = (decisionId: string) =>
    edges.find((e) => e.data.label === 'GOVERNS' && e.data.source === decisionId)?.data.target;
  const superseded = decisionNodes.find((n) => String(n.data.properties.status).toLowerCase() === 'superseded');
  const anyDecision = decisionNodes[0];

  if (superseded || anyDecision) {
    const d = (superseded ?? anyDecision)!;
    const title = String(d.data.properties.title ?? d.data.label).replace(/[`?]/g, '').slice(0, 80);
    const comp = governs(d.data.id);
    const where = comp && isBriefableComponent(comp) ? ` in ${comp}` : '';
    scenarios.push(
      superseded
        ? {
            id: 's3-architectural-precedent',
            badge: 'ARCHITECTURAL PRECEDENT',
            title: `Why was \`${title}\` replaced?`,
            query: `Why was ${title} replaced${where}?`,
            description: 'Trace the superseded decision, what replaced it, and the supersession timeline.',
            iconName: 'book-open',
            accentColor: ACCENT,
          }
        : {
            id: 's3-architectural-precedent',
            badge: 'ARCHITECTURAL PRECEDENT',
            title: `What does \`${title}\` constrain?`,
            query: `What does ${title} constrain${where}?`,
            description: 'See which components this decision governs and what precedent it sets.',
            iconName: 'book-open',
            accentColor: ACCENT,
          }
    );
  } else {
    const dependent = components.find((c) => !usedComponents.has(c.name));
    if (dependent) {
      scenarios.push({
        id: 's3-architectural-precedent',
        badge: 'DEPENDENCIES',
        title: `What depends on \`${dependent.name}\`?`,
        query: `What depends on ${dependent.name}?`,
        description: 'Follow coupling edges to see what breaks when this component changes.',
        iconName: 'book-open',
        accentColor: ACCENT,
      });
    }
  }

  return { curated: false, scenarios, entities };
}
