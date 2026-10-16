'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { SplitViewport } from '@/components/layout/split-viewport';
import { ShowcaseHub } from '@/components/hub/showcase-hub';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { HeaderBar } from '@/components/navigation/header-bar';
import { GraphSyncProvider } from '@/lib/graph-sync';
import { useAuth } from '@/app/providers';
import {
  getStoredPreferences,
  addQueryToHistory,
  type ArgonUiPreferences,
} from '@/lib/preferences';
import { CytoscapeCanvas, DEFAULT_SHOWCASE_GRAPH } from '@/components/canvas/cytoscape-canvas';
import { HudControls } from '@/components/canvas/hud-controls';
import { type Workspace } from '@/components/workspace/workspace-switcher';
import type { Core } from 'cytoscape';
import type { CytoscapeElements } from '@argon/graph';

export default function HomePage() {
  const { getToken, activeWorkspace, setActiveWorkspace } = useAuth();
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(activeWorkspace || 'ember-adr-showcase');
  const [currentContributorId, setCurrentContributorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [briefingResponse, setBriefingResponse] = useState<WebBriefingResponse | null>(null);
  const [uiPreferences, setUiPreferences] = useState<ArgonUiPreferences>(() => getStoredPreferences());

  const cyRef = useRef<Core | null>(null);

  // Sync workspace from AuthProvider state (D-15)
  useEffect(() => {
    if (activeWorkspace) {
      setCurrentWorkspaceId(activeWorkspace);
    }
  }, [activeWorkspace]);

  // Listen for reset-workspace custom events (D-15)
  useEffect(() => {
    const handleResetWorkspace = (e: Event) => {
      const customEvent = e as CustomEvent<{ workspaceId?: string }>;
      const targetWs = customEvent.detail?.workspaceId || 'ember-adr-showcase';
      setCurrentWorkspaceId(targetWs);
      if (setActiveWorkspace) {
        setActiveWorkspace(targetWs);
      }
      setBriefingResponse(null);
      setError(null);
    };
    window.addEventListener('argon:reset-workspace', handleResetWorkspace);
    return () => window.removeEventListener('argon:reset-workspace', handleResetWorkspace);
  }, [setActiveWorkspace]);

  // Hydrate preferences on mount
  useEffect(() => {
    setUiPreferences(getStoredPreferences());
  }, []);

  const handleSelectWorkspace = (wsId: string) => {
    setCurrentWorkspaceId(wsId);
    if (setActiveWorkspace) {
      setActiveWorkspace(wsId);
    }
    setBriefingResponse(null);
    setError(null);
  };

  const executeBriefing = async (task: string) => {
    setSelectedTask(task);
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          task,
          workspaceId: currentWorkspaceId,
          contributorId: currentContributorId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setBriefingResponse({
            status: 'FORBIDDEN' as any,
            reason:
              data.error ||
              `Workspace access denied: You do not have permissions for workspace '${currentWorkspaceId}'. Request access from the workspace owner or switch to a showcase workspace.`,
            briefing: null,
            workspaceId: currentWorkspaceId,
            evidence: { nodeCount: 0, verifiedCitationCount: 0 },
          } as any);
        } else if (res.status === 404) {
          setBriefingResponse({
            status: 'NOT_FOUND' as any,
            reason: data.error || `Workspace '${currentWorkspaceId}' not found.`,
            briefing: null,
            workspaceId: currentWorkspaceId,
            evidence: { nodeCount: 0, verifiedCitationCount: 0 },
          } as any);
        } else if (res.status === 503) {
          setBriefingResponse({
            status: 'FALKORDB_TIMEOUT',
            reason: data.reason || 'FalkorDB Graph Unreachable (503): Database connection timed out.',
            briefing: null,
            evidence: { nodeCount: 0, verifiedCitationCount: 0 },
          });
        } else {
          setError(data.message || data.error || 'Failed to generate briefing');
        }
      } else {
        setBriefingResponse(data);
      }
    } catch {
      setBriefingResponse({
        status: 'FALKORDB_TIMEOUT',
        reason: 'FalkorDB Graph Unreachable (503): Network or database egress failed.',
        briefing: null,
        evidence: { nodeCount: 0, verifiedCitationCount: 0 },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectScenario = (query: string) => {
    addQueryToHistory(query);
    setUiPreferences(getStoredPreferences());
    executeBriefing(query);
  };

  const handleQuerySubmit = (query: string) => {
    addQueryToHistory(query);
    setUiPreferences(getStoredPreferences());
    executeBriefing(query);
  };

  const handleIngestSuccess = (newWorkspace: Workspace) => {
    handleSelectWorkspace(newWorkspace.id);
  };

  const handleRetryConnection = () => {
    if (selectedTask) {
      executeBriefing(selectedTask);
    }
  };

  // Dynamically compute Cytoscape elements from active briefing evidence (Decision D-13 & D-16)
  const canvasElements = useMemo<CytoscapeElements>(() => {
    const briefing = briefingResponse?.briefing;
    if (!briefing) return DEFAULT_SHOWCASE_GRAPH;

    const nodes: CytoscapeElements['nodes'] = [];
    const edges: CytoscapeElements['edges'] = [];

    // 1. Add Affected Components
    briefing.blastRadius.affectedComponents.forEach((comp) => {
      const compId = comp.citedNodeIds?.[0] || `c:${comp.component}`;
      nodes.push({
        data: {
          id: compId,
          label: comp.component,
          type: 'Component',
          properties: { reason: comp.reason },
        },
      });
    });

    // 2. Add Key Owners
    briefing.keyOwners.forEach((owner) => {
      nodes.push({
        data: {
          id: owner.personId,
          label: owner.name,
          type: 'Person',
          properties: { role: owner.role, commits: owner.authoredCount, component: owner.component },
        },
      });

      // Edge from owner to component
      const targetComp = nodes.find((n) => n.data.label === owner.component);
      if (targetComp) {
        edges.push({
          data: {
            id: `e-owner-${owner.personId}-${targetComp.data.id}`,
            source: owner.personId,
            target: targetComp.data.id,
            label: 'OWNS',
            properties: {},
          },
        });
      }
    });

    // 3. Add Constraining Decisions
    briefing.constrainingDecisions.forEach((dec) => {
      nodes.push({
        data: {
          id: dec.decisionId,
          label: dec.title,
          type: 'Decision',
          properties: { status: dec.status, component: dec.component, constraint: dec.constraint },
        },
      });

      // Edge from decision to component
      const targetComp = nodes.find((n) => n.data.label === dec.component);
      if (targetComp) {
        edges.push({
          data: {
            id: `e-dec-${dec.decisionId}-${targetComp.data.id}`,
            source: dec.decisionId,
            target: targetComp.data.id,
            label: 'GOVERNS',
            properties: {},
          },
        });
      }
    });

    // 4. Add Precedents & Supersession Edges
    briefing.precedents.forEach((prec) => {
      nodes.push({
        data: {
          id: prec.decisionId,
          label: prec.title,
          type: 'Decision',
          properties: { status: 'superseded', relevance: prec.relevance },
        },
      });

      // Link precedent to active decision if available
      const activeDec = briefing.constrainingDecisions[0];
      if (activeDec) {
        edges.push({
          data: {
            id: `e-prec-${prec.decisionId}-${activeDec.decisionId}`,
            source: prec.decisionId,
            target: activeDec.decisionId,
            label: 'SUPERSEDED_BY',
            properties: {},
          },
        });
      }
    });

    return {
      nodes: nodes.length > 0 ? nodes : DEFAULT_SHOWCASE_GRAPH.nodes,
      edges: edges.length > 0 ? edges : DEFAULT_SHOWCASE_GRAPH.edges,
    };
  }, [briefingResponse]);

  return (
    <GraphSyncProvider>
      <main className="min-h-screen bg-background text-foreground flex flex-col font-mono">
        {/* Unified Top Navigation Header */}
        <HeaderBar
          currentQuery={selectedTask}
          isLoading={isLoading}
          error={error}
          onSubmitQuery={handleQuerySubmit}
          currentWorkspaceId={currentWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onIngestSuccess={handleIngestSuccess}
          currentContributorId={currentContributorId}
          onSelectContributor={setCurrentContributorId}
        />

        {/* Main Dual-Pane Resizable Viewport */}
        <div className="flex-1 overflow-hidden">
          <SplitViewport
            defaultLayout={uiPreferences.split_viewport_sizes || [45, 55]}
            leftPanel={
              <div className="h-full bg-background">
                {isLoading || briefingResponse ? (
                  <BriefingView
                    response={briefingResponse}
                    isLoading={isLoading}
                    onRetryConnection={handleRetryConnection}
                    onSelectWorkspace={handleSelectWorkspace}
                  />
                ) : (
                  <ShowcaseHub onSelectScenario={handleSelectScenario} />
                )}
              </div>
            }
            rightPanel={
              <div className="h-full w-full relative bg-card overflow-hidden">
                {/* Interactive Cytoscape Canvas */}
                <CytoscapeCanvas
                  elements={canvasElements}
                  cyRef={cyRef}
                  className="w-full h-full"
                />

                {/* Floating Cyber HUD Controls */}
                <HudControls
                  cy={cyRef.current}
                />
              </div>
            }
          />
        </div>
      </main>
    </GraphSyncProvider>
  );
}
