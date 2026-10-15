# Phase 4: Next.js Frontend & Graph Canvas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 4-Next.js Frontend & Graph Canvas
**Areas discussed:** Canvas & Briefing Viewport Layout, Evidence Card & Canvas Interaction, Command Bar & Workspace Controls, Cytoscape Layout Engine & 2077 Visual Styling

---

## Canvas & Briefing Viewport Layout

### Question 1: How should the Briefing Stream and Cytoscape Canvas be arranged on screen?
| Option | Description | Selected |
|--------|-------------|----------|
| Resizable split-pane (react-resizable-panels) | Left briefing stream (~45%) + Right interactive canvas (~55%), with collapse toggle and mobile tab switcher (Briefing / Graph) | ✓ |
| Fixed split-pane | Left scrollable briefing column (45%) and right fixed-height Cytoscape canvas (55%), collapsing to stacked cards on mobile | |
| Master-detail drawer | Full-width briefing cards with an expandable right drawer / modal sheet when inspecting graph traversals | |
| You decide | Pick the cleanest layout for judging demos | |

**User's choice:** Resizable split-pane (`react-resizable-panels`)
**Notes:** Provides desktop fluidity for side-by-side inspection while handling mobile via tab switching.

### Question 2: How should the 5 Briefing sections be navigated in the left panel?
| Option | Description | Selected |
|--------|-------------|----------|
| Vertical continuous card stream | Sticky section jump-bar (Summary, Blast Radius, Owners, Decisions, Precedent) and citation badge counters | ✓ |
| Collapsible Accordion sections | Each category defaults to open but can be collapsed with header summary stats | |
| Tabbed category navigation | Single active tab at a time to reduce scroll depth on long briefings | |
| You decide | | |

**User's choice:** Vertical continuous card stream with a sticky section jump-bar and citation badge counters.
**Notes:** Keeps the full briefing visible as a unified document with quick anchor jumping.

### Question 3: What should the initial landing state display before the first query is submitted?
| Option | Description | Selected |
|--------|-------------|----------|
| Showcase Hub | 3 one-click scenario cards (S1: Refactor billing/retry.ts, S2: Auth onboarding, S3: Why does legacy-sync exist?) + high-level component map on right canvas | ✓ |
| Minimalist Terminal Landing | Centered command bar with sample query chips and a dormant dark grid on the canvas until queried | |
| You decide | | |

**User's choice:** Showcase Hub with 3 one-click scenario cards and component map on the right canvas.
**Notes:** Enables immediate zero-typing evaluation during hackathon judging.

### Question 4: How should the 'No graph, no answer' failure state and error conditions be rendered?
| Option | Description | Selected |
|--------|-------------|----------|
| Brutalist Kill-Switch Hero Card | Neon red border, diagnostic error badge (e.g. CITATION_INTEGRITY_FAILURE / FALKORDB_TIMEOUT), explicit 'No graph, no answer' enforcement copy, and 'Test DB Connection' action | ✓ |
| Subtle Alert Toast + Empty State | Standard red alert box at top of briefing stream with collapsible raw diagnostic payload | |
| You decide | | |

**User's choice:** Brutalist Kill-Switch Hero Card with neon red border and diagnostic error badge.
**Notes:** Visually highlights the core value ("no graph, no answer") when graph connectivity or citation validation fails.

---

## Evidence Card & Canvas Interaction

### Question 1: How should hovering and clicking an Evidence Card affect the Cytoscape canvas?
| Option | Description | Selected |
|--------|-------------|----------|
| Multi-level reactive highlighting | Hover pulses cited nodes/edges and dims background graph to 20% opacity; clicking locks selection and smoothly pans/zooms camera to the cited subgraph bounding box | ✓ |
| Instant subgraph filter | Clicking an Evidence Card isolates only the cited nodes/edges on canvas, hiding non-cited elements | |
| Subtle badge highlight | Nodes glow with neon border without moving or zooming the canvas camera | |
| You decide | | |

**User's choice:** Multi-level reactive highlighting with hover pulse, background dimming, and smooth camera zoom on click.
**Notes:** Maintains contextual awareness of the full graph while spotlighting cited evidence.

### Question 2: What happens when a user clicks a node directly on the Cytoscape canvas?
| Option | Description | Selected |
|--------|-------------|----------|
| Bidirectional focus | Clicking a canvas node displays an in-canvas inspector tooltip (node ID, properties, source URL) AND smoothly scrolls the left panel to highlight the cited Evidence Card | ✓ |
| Canvas-only inspector sheet | Clicking a node slides out a quick-inspector drawer within the canvas pane displaying raw Cypher properties and relationships | |
| You decide | | |

**User's choice:** Bidirectional focus: In-canvas inspector tooltip + smooth scroll to the cited Evidence Card.
**Notes:** Establishes a true two-way bridge between graph topology and textual claims.

### Question 3: What details should each Evidence Card display in the briefing stream?
| Option | Description | Selected |
|--------|-------------|----------|
| Rich Brutalist Evidence Card | Type badge (DECISION/FILE/COMPONENT), FalkorDB Node ID (#id), temporal status (valid/superseded), direct git/ADR link, and 'Focus in Graph' button | ✓ |
| Compact Reference Chip | Minimalist inline badge with node title and external link icon, expanding metadata on accordion toggle | |
| You decide | | |

**User's choice:** Rich Brutalist Evidence Card with Type badge, Node ID, temporal status, direct link, and Focus button.
**Notes:** Maximizes citation explainability and provenance inspection.

### Question 4: How should multi-hop traversal paths (blast radius, dependency chains) be emphasized on the canvas?
| Option | Description | Selected |
|--------|-------------|----------|
| Animated Traversal March | Pulsing directed edge glow / animated dash-offset highlighting the exact multi-hop path from origin to blast-radius targets or supersession chains | ✓ |
| Static Accent Glow | Thicker solid neon edge lines (3px) with prominent arrowheads and glow filter without movement | |
| You decide | | |

**User's choice:** Animated Traversal March with pulsing directed edge glow and animated dash offset.
**Notes:** Makes algorithmic graph traversals visibly distinct and dynamic.

---

## Command Bar & Workspace Controls

### Question 1: How should the primary command bar be triggered and operated?
| Option | Description | Selected |
|--------|-------------|----------|
| Dual Invocation Command Bar | Sticky top-bar search input + Cmd/Ctrl+K centered Command Palette (cmdk) with file/component autocomplete and curated demo prompts | ✓ |
| Embedded Header Input | Fixed single-line brutalist input field in the top navigation bar with dropdown history chips | |
| You decide | | |

**User's choice:** Dual Invocation Command Bar (Sticky header input + Cmd/Ctrl+K Command Palette).
**Notes:** Blends fast access with keyboard shortcut power-user workflows.

### Question 2: How should guest workspace switching and new repository ingestion be presented?
| Option | Description | Selected |
|--------|-------------|----------|
| Header Workspace Switcher + Ingestion Modal | Dropdown in top-nav listing preloaded showcase repos + 'Ingest Repo' action opening a modal with real-time IngestJob step progress | ✓ |
| Command Palette Workspace Navigation | Workspace switching handled inside Cmd+K palette under a 'Workspaces' section | |
| You decide | | |

**User's choice:** Header Workspace Switcher + Ingestion Modal with real-time `IngestJob` step progress.
**Notes:** Allows instant testing of pre-indexed corpora (Ember, Astro, Synthetic) while providing live ingestion feedback for arbitrary repos.

### Question 3: How should the Contributor Selector ('Who am I') be accessed and managed?
| Option | Description | Selected |
|--------|-------------|----------|
| Header Contributor Pill & Combobox | A 'Who am I' pill in the header showing active identity (e.g. 'Sarah Connor [Top Contributor]' or 'Guest (Unassigned)'), clicking opens a searchable combobox of repo authors | ✓ |
| Inline Command Bar Prefix | Setting identity via the command bar (e.g. '@contributor Sarah Connor' or a prompt suggestion) | |
| You decide | | |

**User's choice:** Header Contributor Pill & Combobox.
**Notes:** Satisfies `WS-01` / `FR-4` guest personalization without requiring login.

### Question 4: How should apps/web connect to the backend briefing pipeline?
| Option | Description | Selected |
|--------|-------------|----------|
| Next.js Server Route (/api/briefing) | Secure server-side execution via packages/agent (auto-selecting HttpGatewayClient or DirectGraphGatewayClient via server env) keeping gateway tokens private | ✓ |
| Server Action with React UseActionState | Next.js Server Action called directly from client components with optimistic state transitions | |
| You decide | | |

**User's choice:** Next.js Server Route (`POST /api/briefing`).
**Notes:** Encapsulates gateway credentials and client instantiation safely on the server side.

---

## Cytoscape Layout Engine & 2077 Visual Styling

### Question 1: Which layout algorithm should Cytoscape.js use to position graph nodes?
| Option | Description | Selected |
|--------|-------------|----------|
| fcose / cose force-directed | Physics-based spring layout with natural clustering by component, collision avoidance, and smooth node-position animations on update | ✓ |
| dagre hierarchical layout | Strict left-to-right or top-to-bottom architectural flow highlighting dependency direction | |
| concentric radial layout | Central high-risk nodes (PageRank) at the center with dependent files on outer rings | |
| You decide | | |

**User's choice:** `fcose` / `cose` force-directed physics layout.
**Notes:** Provides natural clustering of components and smooth animated transitions.

### Question 2: How should node types and statuses be visually encoded on the canvas?
| Option | Description | Selected |
|--------|-------------|----------|
| Semantic Brutalist 2077 Encoding | Decision = diamond/hex (#ffb800 warning / #ff0055 superseded), Component = large rounded-rect (#00f0ff cyan), File = compact rect (#58a6ff), Person = circle (#bc8cff) | ✓ |
| Monochrome Cyber Dark | All nodes uniform dark carbon (#161b22) with distinct neon border glow tokens and icon glyphs | |
| You decide | | |

**User's choice:** Semantic Brutalist 2077 Encoding.
**Notes:** Directly maps the 2077 theme CSS variables to Cytoscape element styles at runtime.

### Question 3: What viewport controls and HUD overlays should be provided on the graph canvas?
| Option | Description | Selected |
|--------|-------------|----------|
| Floating Cyber HUD Controls | Bottom-right overlay buttons for Zoom In/Out, Fit to View, Re-run Layout, Subgraph Filter (Cited only vs Neighborhood), and Export Snapshot | ✓ |
| Minimalist Gesture Only | Mouse wheel zoom and pan drag with subtle mini-map overlay only | |
| You decide | | |

**User's choice:** Floating Cyber HUD Controls.
**Notes:** Delivers essential inspection tools (zoom, fit, layout re-run, filter, snapshot) in a compact overlay.

### Question 4: How should graph size and rendering performance be bounded on the canvas?
| Option | Description | Selected |
|--------|-------------|----------|
| Bounded Evidence Subgraph (max ~150 elements) | Render the focused query subgraph from DualPayload.graph (primary + 1-2 hops), with on-demand 'Expand Node' on double-click | ✓ |
| Global Full-Graph Virtualization | Render the entire workspace graph with level-of-detail (LOD) node culling at low zoom levels | |
| You decide | | |

**User's choice:** Bounded Evidence Subgraph (max ~150 elements) with on-demand node expansion.
**Notes:** Guarantees 60fps rendering in Cytoscape.js while avoiding visual clutter.

---

## the agent's Discretion

- Component structuring inside `apps/web/components/`.
- Specific Cytoscape force simulation coefficients (edge elasticity, repulsion, damping).
- Exact animation timing and curve parameters for camera pans and edge marches.

## Deferred Ideas

- None — all decisions stayed strictly within Phase 4 scope.
