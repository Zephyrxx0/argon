'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { createCytoscapeStylesheet } from './stylesheet';
import { get2077ThemeTokens } from '@/lib/theme';
import { useGraphSync } from '@/lib/graph-sync';
import { NodeInspector, type InspectedNode } from './node-inspector';
import { startMarchingAnimation, type AnimatorHandle } from './traversal-animator';
import type { CytoscapeElements } from '@argon/graph';
import { clsx } from 'clsx';

// Register fcose force layout extension once
let isFcoseRegistered = false;
if (typeof window !== 'undefined' && !isFcoseRegistered) {
  try {
    cytoscape.use(fcose);
    isFcoseRegistered = true;
  } catch {
    // Ignore duplicate registrations
  }
}

export interface CytoscapeCanvasProps {
  elements?: CytoscapeElements | null;
  onNodeSelect?: (nodeId: string) => void;
  className?: string;
  cyRef?: React.MutableRefObject<Core | null>;
}

// Default high-level showcase component overview graph (Decision D-03)
export const DEFAULT_SHOWCASE_GRAPH: CytoscapeElements = {
  nodes: [
    { data: { id: 'c:BillingEngine', label: 'BillingEngine', type: 'Component', properties: { tier: 'Core', coupling: 'High' } } },
    { data: { id: 'c:AuthService', label: 'AuthService', type: 'Component', properties: { tier: 'Security', rbac: true } } },
    { data: { id: 'c:SyncGateway', label: 'SyncGateway', type: 'Component', properties: { tier: 'Integration', legacy: true } } },
    { data: { id: 'f:billing/retry.ts', label: 'retry.ts', type: 'File', properties: { path: 'billing/retry.ts', commits: 14 } } },
    { data: { id: 'f:auth/session.ts', label: 'session.ts', type: 'File', properties: { path: 'auth/session.ts', commits: 8 } } },
    { data: { id: 'd:RFC-014', label: 'RFC-014', type: 'Decision', properties: { title: 'Async Retry Queue', status: 'active' } } },
    { data: { id: 'd:RFC-008', label: 'RFC-008', type: 'Decision', properties: { title: 'Sync Blockers', status: 'superseded' } } },
    { data: { id: 'p:sarah-connor', label: 'Sarah Connor', type: 'Person', properties: { role: 'Lead Architect', commits: 342 } } },
  ],
  edges: [
    { data: { id: 'e1', source: 'f:billing/retry.ts', target: 'c:BillingEngine', label: 'DEFINES', properties: {} } },
    { data: { id: 'e2', source: 'f:auth/session.ts', target: 'c:AuthService', label: 'DEFINES', properties: {} } },
    { data: { id: 'e3', source: 'd:RFC-014', target: 'c:BillingEngine', label: 'GOVERNS', properties: {} } },
    { data: { id: 'e4', source: 'd:RFC-008', target: 'd:RFC-014', label: 'SUPERSEDED_BY', properties: {} } },
    { data: { id: 'e5', source: 'p:sarah-connor', target: 'c:BillingEngine', label: 'OWNS', properties: {} } },
    { data: { id: 'e6', source: 'c:BillingEngine', target: 'c:SyncGateway', label: 'DEPENDS_ON', properties: {} } },
  ],
};

export function CytoscapeCanvas({
  elements,
  onNodeSelect,
  className,
  cyRef,
}: CytoscapeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<Core | null>(null);
  const animatorRef = useRef<AnimatorHandle | null>(null);

  const [inspectedNode, setInspectedNode] = useState<InspectedNode | null>(null);
  const { hoveredNodeId, focusRequest, setSelectedNode, lastSyncEvent } = useGraphSync();

  // Bound elements to 150 items max (Decision D-16)
  const activeElements = elements ?? DEFAULT_SHOWCASE_GRAPH;
  const boundedNodes = activeElements.nodes.slice(0, 100);
  const boundedEdges = activeElements.edges.slice(0, 50);

  const runLayout = useCallback((cy: Core) => {
    try {
      if (!containerRef.current || containerRef.current.clientWidth === 0) {
        return;
      }
      const layout = cy.layout({
        name: 'fcose',
        animate: true,
        animationDuration: 400,
        fit: true,
        padding: 40,
        randomize: false,
        nodeRepulsion: () => 4500,
        idealEdgeLength: () => 70,
        edgeElasticity: () => 0.45,
      } as any);
      layout.run();
    } catch {
      // Safe no-op in headless test environment
    }
  }, []);

  // Initialize Cytoscape Instance
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    const tokens = get2077ThemeTokens();
    const stylesheet = createCytoscapeStylesheet(tokens);

    let cy: Core;
    try {
      cy = cytoscape({
        container: containerRef.current,
        style: stylesheet as any,
        layout: { name: 'preset' },
        elements: {
          nodes: boundedNodes.map((n) => ({ data: n.data })),
          edges: boundedEdges.map((e) => ({ data: e.data })),
        },
        boxSelectionEnabled: false,
        autounselectify: false,
        minZoom: 0.2,
        maxZoom: 3.5,
      });
    } catch {
      return;
    }

    cyInstanceRef.current = cy;
    if (cyRef) cyRef.current = cy;

    runLayout(cy);

    // Node click handler (Decision D-06)
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      const data = node.data();
      const pos = node.renderedPosition();

      const nodePayload: InspectedNode = {
        id: data.id,
        label: data.label || data.id,
        type: data.type || 'Entity',
        properties: data.properties || {},
        position: pos,
      };

      setInspectedNode(nodePayload);
      setSelectedNode(data.id);
      onNodeSelect?.(data.id);
    });

    // Tap background closes inspector
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setInspectedNode(null);
      }
    });

    return () => {
      if (animatorRef.current) {
        animatorRef.current.stop();
        animatorRef.current = null;
      }
      cy.destroy();
      cyInstanceRef.current = null;
      if (cyRef) cyRef.current = null;
    };
  }, [boundedNodes.length, boundedEdges.length, runLayout, cyRef, onNodeSelect, setSelectedNode]);

  // Handle Card Hover Pulse & Dimming (Decision D-05)
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    if (!hoveredNodeId) {
      cy.elements().removeClass('highlighted dimmed marching-edge');
      if (animatorRef.current) {
        animatorRef.current.stop();
        animatorRef.current = null;
      }
      return;
    }

    const cleanId = hoveredNodeId.startsWith('#') ? hoveredNodeId.slice(1) : hoveredNodeId;
    const targetNode = cy.getElementById(cleanId);

    if (targetNode && targetNode.length > 0) {
      cy.elements().addClass('dimmed').removeClass('highlighted');
      const neighborhood = targetNode.closedNeighborhood();
      neighborhood.removeClass('dimmed').addClass('highlighted');

      // Start marching edge animation along highlighted paths (Decision D-08)
      if (animatorRef.current) animatorRef.current.stop();
      animatorRef.current = startMarchingAnimation(cy);
    }
  }, [hoveredNodeId]);

  // Handle Focus Request / Camera Pan-Zoom (Decision D-05)
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy || !focusRequest) return;

    const cleanId = focusRequest.nodeId.startsWith('#')
      ? focusRequest.nodeId.slice(1)
      : focusRequest.nodeId;

    const targetNode = cy.getElementById(cleanId);
    if (targetNode && targetNode.length > 0) {
      cy.animate({
        fit: {
          eles: targetNode.closedNeighborhood(),
          padding: 60,
        },
        duration: 400,
        easing: 'ease-in-out-cubic' as any,
      });
    }
  }, [focusRequest]);

  // Handle Live Incremental Sync Pulse & ADR Supersession (Task 08-03-02, SYNC-03)
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy || !lastSyncEvent) return;

    // 1. Mark superseded decision nodes with dashed dimmed styling
    for (const supersededId of lastSyncEvent.superseded) {
      const candidates = [supersededId, `d:${supersededId}`, `dec:${supersededId}`];
      for (const id of candidates) {
        const node = cy.getElementById(id);
        if (node && node.length > 0) {
          node.addClass('superseded-adr');
        }
      }
    }

    // 2. Collect all updated node IDs
    const candidateIds = [
      ...lastSyncEvent.updated.commits.flatMap((c) => [c, `cm:${c}`, `commit:${c}`]),
      ...lastSyncEvent.updated.files.flatMap((f) => [f, `f:${f}`, `file:${f}`]),
      ...lastSyncEvent.updated.decisions.flatMap((d) => [d, `d:${d}`, `dec:${d}`]),
    ];

    // 3. Highlight updated nodes with .synced-pulse class
    const pulsedNodes: any[] = [];
    for (const id of candidateIds) {
      const node = cy.getElementById(id);
      if (node && node.length > 0) {
        node.addClass('synced-pulse');
        pulsedNodes.push(node);
      }
    }

    // 4. Auto-remove pulse class after animation duration
    if (pulsedNodes.length > 0) {
      const timer = setTimeout(() => {
        for (const n of pulsedNodes) {
          n.removeClass('synced-pulse');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [lastSyncEvent]);

  return (
    <div className={clsx('relative w-full h-full font-mono bg-card overflow-hidden', className)}>
      {/* Cytoscape WebGL/Canvas Container */}
      <div
        ref={containerRef}
        data-testid="cytoscape-container"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* In-Canvas Node Inspector Popover */}
      <NodeInspector
        node={inspectedNode}
        onClose={() => setInspectedNode(null)}
      />
    </div>
  );
}
