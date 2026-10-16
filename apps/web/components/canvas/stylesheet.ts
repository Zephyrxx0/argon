import type { Theme2077Tokens } from '@/lib/theme';

export function createCytoscapeStylesheet(tokens: Theme2077Tokens) {
  return [
    // 1. Default Node
    {
      selector: 'node',
      style: {
        'background-color': tokens.card,
        'border-width': 2,
        'border-color': tokens.border,
        color: tokens.foreground,
        'font-family': 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        'font-size': '11px',
        'font-weight': 600,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'ellipsis',
        'text-max-width': '80px',
        label: 'data(label)',
        'transition-property': 'background-color, border-color, border-width, opacity',
        'transition-duration': '0.15s',
      },
    },

    // 2. Decision Nodes (Diamond)
    {
      selector: 'node[type = "Decision"], node[type = "decision"]',
      style: {
        shape: 'diamond',
        'border-color': tokens.nodeDecision,
        width: 36,
        height: 36,
      },
    },

    // 3. Superseded Decisions
    {
      selector: 'node[type = "Decision"][status = "superseded"], node[status = "superseded"]',
      style: {
        shape: 'diamond',
        'border-color': tokens.danger,
        'border-style': 'dashed',
        opacity: 0.85,
      },
    },

    // 4. Component Nodes (Rounded Rectangle)
    {
      selector: 'node[type = "Component"], node[type = "component"]',
      style: {
        shape: 'round-rectangle',
        'border-color': tokens.nodeComponent,
        width: 48,
        height: 28,
      },
    },

    // 5. File Nodes (Rectangle)
    {
      selector: 'node[type = "File"], node[type = "file"]',
      style: {
        shape: 'rectangle',
        'border-color': tokens.nodeFile,
        width: 36,
        height: 22,
      },
    },

    // 6. Person Nodes (Ellipse / Circle)
    {
      selector: 'node[type = "Person"], node[type = "person"]',
      style: {
        shape: 'ellipse',
        'border-color': tokens.nodePerson,
        width: 32,
        height: 32,
      },
    },

    // 7. Default Edge
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'line-color': tokens.border,
        'target-arrow-color': tokens.border,
        width: 1.5,
        'arrow-scale': 0.8,
        'transition-property': 'line-color, target-arrow-color, width, opacity',
        'transition-duration': '0.15s',
      },
    },

    // 8. Reactive Highlight State
    {
      selector: 'node.highlighted',
      style: {
        'border-color': tokens.accent,
        'border-width': 4,
        'z-index': 999,
        'background-color': '#003a42',
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        'line-color': tokens.accent,
        'target-arrow-color': tokens.accent,
        width: 3,
        'z-index': 998,
      },
    },

    // 9. Dimmed Background State
    {
      selector: 'node.dimmed',
      style: {
        opacity: 0.2,
      },
    },
    {
      selector: 'edge.dimmed',
      style: {
        opacity: 0.15,
      },
    },

    // 10. Marching Traversal Path Edge
    {
      selector: 'edge.marching-edge',
      style: {
        'line-color': tokens.accent,
        'target-arrow-color': tokens.accent,
        'line-style': 'dashed',
        width: 2.5,
      },
    },

    // 11. Synced Pulse Node (Wave 3 - SYNC-03)
    {
      selector: 'node.synced-pulse',
      style: {
        'border-color': tokens.accent,
        'border-width': 5,
        'background-color': '#003a42',
        'z-index': 1000,
        opacity: 1,
        'transition-property': 'border-color, border-width, background-color, opacity',
        'transition-duration': '1.2s',
      },
    },

    // 12. Superseded ADR Node (Wave 3 - SYNC-03)
    {
      selector: 'node.superseded-adr',
      style: {
        opacity: 0.4,
        'border-style': 'dashed',
        'border-color': tokens.danger,
        'border-width': 2,
      },
    },
  ];
}

