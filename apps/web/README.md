# Argon Web (`apps/web`)

> Next.js 15 App Router frontend with brutalist 2077 tweakcn aesthetic, resizable split-viewport, and interactive Cytoscape.js force-directed graph canvas.

---

## 🎨 Architectural Design & Layout

Argon Web implements a split-pane workstation layout (`components/layout/split-viewport.tsx`):
- **Left Panel (~45% default width)**: Continuous Briefing Stream (`components/briefing/briefing-view.tsx`).
  - Sticky jump bar with live citation count badges per category (`components/briefing/sticky-jump-bar.tsx`).
  - Color-coded typed Evidence Cards with FalkorDB `#id` labels and temporal status badges (`components/briefing/evidence-card.tsx`).
  - High-visibility "No graph, no answer" refusal card on integrity or connection failure (`components/briefing/kill-switch-card.tsx`).
  - Initial Showcase Hub for pre-indexed repositories when no briefing is loaded (`components/hub/showcase-hub.tsx`).
- **Right Panel (~55% default width)**: Interactive Cytoscape Graph Canvas (`components/canvas/cytoscape-canvas.tsx`).
  - Client-side physics simulation powered by `cytoscape-fcose`.
  - 2077 Cyberpunk semantic encoding (`components/canvas/stylesheet.ts`):
    - Decisions: `diamond` (`#ffb800` warning gold / superseded in `#ff0055` red dashed).
    - Components: `round-rectangle` (`#00f0ff` cyan).
    - Files: `rectangle` (`#58a6ff` blue).
    - Persons: `ellipse` (`#bc8cff` purple).
  - Traversal Animator (`components/canvas/traversal-animator.ts`): Animates edge dash offsets along multi-hop citation paths.
  - Bidirectional Highlighting (`lib/graph-sync.tsx`): Hovering cards dims background nodes to 20% opacity and pulses cited nodes; clicking nodes opens the in-canvas Node Inspector (`components/canvas/node-inspector.tsx`) and scrolls the left panel to the citing card.
  - Floating Cyber HUD (`components/canvas/hud-controls.tsx`): Zoom, Fit View, Re-run Layout, Subgraph Filter, and Snapshot export.

---

## ⌨️ Command Bar & Workspace Navigation

- **Command Bar (`components/command/command-bar.tsx`)**: Header search field with keyboard trigger hint (`⌘K` / `Ctrl+K`).
- **Command Palette (`components/command/command-dialog.tsx`)**: Global centered dialog powered by `cmdk`.
- **Workspace Switcher (`components/workspace/workspace-switcher.tsx`)**: Selects pre-indexed showcase repos or triggers the Ingest Modal (`components/workspace/ingest-modal.tsx`) with SSRF protections.
- **Contributor Identity Picker (`components/contributor/contributor-picker.tsx`)**: "Who am I" selector supporting personalized blast radius warning or guest mode.

---

## 🛠 Tech Stack

- **Framework**: Next.js 15.2.0 (App Router, Turbopack ready, static prerendering)
- **Styling**: Tailwind CSS 3.4 + Radix UI primitives + Lucide React
- **Graph Visualization**: Cytoscape.js 3.31 + `cytoscape-fcose` 2.2
- **Testing**: Vitest 3.2 + `@testing-library/react` + JSDOM
- **Schema Validation**: Zod 3.24

---

## 🏃 Commands

```bash
# Start development server
pnpm --filter web dev

# Run Vitest unit & integration test suites
pnpm --filter web test

# Run TypeScript typecheck
pnpm --filter web typecheck

# Build optimized production bundle
pnpm --filter web build
```

---

## 🧪 Test Suites

The test suite in `apps/web/tests/` provides 100% automated coverage for frontend behaviors:

- `viewport.test.tsx`: Split-viewport resizing and collapse toggles.
- `command-bar.test.tsx`: Header command bar and `Cmd+K` keyboard shortcuts.
- `workspace.test.tsx`: Workspace switcher and Ingest modal SSRF validation.
- `header.test.tsx`: Header branding and action bar.
- `showcase-hub.test.tsx`: Showcase cards and one-click query triggers.
- `evidence-card.test.tsx`: Evidence card rendering and "Focus in Graph" dispatch.
- `briefing-view.test.tsx`: Briefing stream sections, loading skeletons, and Kill-Switch card.
- `api-briefing.test.ts`: Route handler Zod validation and client auto-selection.
- `cytoscape-style.test.ts`: 2077 node geometry and color selector mapping.
- `graph-sync.test.ts`: Bidirectional state transitions between cards and canvas.
- `page-integration.test.tsx`: End-to-end query execution to canvas rendering.
