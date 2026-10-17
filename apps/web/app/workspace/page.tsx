'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { useWorkspaceResource } from '@/lib/use-workspace-resource';
import { buildSuggestions } from '@/lib/scenarios';
import type { OverviewResponse } from '@/lib/workspace-data';
import { InsightPane } from '@/components/workspace/insight-pane';
import { type Workspace } from '@/components/workspace/workspace-switcher';
import type { GraphElements } from '@/lib/graph/model';

export default function WorkspacePage() {
  const { getToken, activeWorkspace, setActiveWorkspace, user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(activeWorkspace || 'ember-adr-showcase');
  const [currentContributorId, setCurrentContributorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // A briefing belongs to the workspace it was generated for; it is never shown for another one.
  const [briefingState, setBriefingState] = useState<{
    workspaceId: string;
    response: WebBriefingResponse;
  } | null>(null);
  const briefingResponse =
    briefingState && briefingState.workspaceId === currentWorkspaceId ? briefingState.response : null;
  const inFlightRef = useRef<AbortController | null>(null);
  const [uiPreferences, setUiPreferences] = useState<ArgonUiPreferences>(() => getStoredPreferences());
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);

  // Retrieve token for SSE live sync stream (SYNC-03)
  useEffect(() => {
    let active = true;
    if (typeof getToken === 'function') {
      getToken().then((tok) => {
        if (active && tok) {
          setAuthToken(tok);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [getToken, currentWorkspaceId]);

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
    };
    window.addEventListener('argon:reset-workspace', handleResetWorkspace);
    return () => window.removeEventListener('argon:reset-workspace', handleResetWorkspace);
  }, [setActiveWorkspace]);

  // Hydrate preferences on mount
  useEffect(() => {
    setUiPreferences(getStoredPreferences());
  }, []);

  // Everything that is scoped to a workspace is dropped the moment the workspace changes, whatever
  // triggered the change (switcher, ingest completion, sign-out reset, auth state).
  const previousWorkspaceRef = useRef(currentWorkspaceId);
  useEffect(() => {
    if (previousWorkspaceRef.current === currentWorkspaceId) return;
    previousWorkspaceRef.current = currentWorkspaceId;
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    setBriefingState(null);
    setIsLoading(false);
    setError(null);
    setSelectedTask('');
    setCurrentContributorId(null);
  }, [currentWorkspaceId]);

  useEffect(() => () => inFlightRef.current?.abort(), []);

  const handleSelectWorkspace = (wsId: string) => {
    setCurrentWorkspaceId(wsId);
    if (setActiveWorkspace) {
      setActiveWorkspace(wsId);
    }
  };

  const executeBriefing = async (task: string) => {
    const workspaceId = currentWorkspaceId;
    const contributorId = currentContributorId;

    // A newer request supersedes the previous one
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    const isCurrent = () => inFlightRef.current === controller && !controller.signal.aborted;

    setSelectedTask(task);
    setIsLoading(true);
    setError(null);

    const show = (response: WebBriefingResponse) => {
      if (isCurrent()) setBriefingState({ workspaceId, response });
    };
    const refusal = (status: string, reason: string, extra: Record<string, unknown> = {}) =>
      show({
        status,
        reason,
        briefing: null,
        workspaceId,
        evidence: { nodeCount: 0, verifiedCitationCount: 0 },
        ...extra,
      } as unknown as WebBriefingResponse);

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ task, workspaceId, contributorId }),
      });

      const data = await res.json();
      if (!isCurrent()) return;

      if (!res.ok) {
        if (res.status === 403) {
          refusal(
            'FORBIDDEN',
            data.error ||
              `Workspace access denied: You do not have permissions for workspace '${workspaceId}'. Request access from the workspace owner or switch to a showcase workspace.`
          );
        } else if (res.status === 404) {
          refusal('NOT_FOUND', data.error || `Workspace '${workspaceId}' not found.`);
        } else if (res.status === 503) {
          refusal(
            'FALKORDB_TIMEOUT',
            data.reason || 'FalkorDB Graph Unreachable (503): Database connection timed out.'
          );
        } else {
          setError(data.message || data.error || data.reason || 'Failed to generate briefing');
        }
      } else {
        show(data);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || !isCurrent()) return;
      refusal('FALKORDB_TIMEOUT', 'FalkorDB Graph Unreachable (503): Network or database egress failed.');
    } finally {
      // Only the request that is still current owns the loading flag
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
        setIsLoading(false);
      }
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

  // Dynamically compute graph elements from active briefing evidence (Decision D-13 & D-16)
  const canvasElements = useMemo<GraphElements | null>(() => {
    const briefing = briefingResponse?.briefing;
    if (!briefing) return null;

    const nodes: GraphElements['nodes'] = [];
    const edges: GraphElements['edges'] = [];

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
          label: dec.decisionId.replace(/^#?d:/i, ''),
          type: 'Decision',
          properties: { title: dec.title, status: dec.status, component: dec.component, constraint: dec.constraint },
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
          label: prec.decisionId.replace(/^#?d:/i, ''),
          type: 'Decision',
          properties: { title: prec.title, status: 'superseded', relevance: prec.relevance },
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

    return nodes.length > 0 ? { nodes, edges } : null;
  }, [briefingResponse]);

  // Without a (graphable) briefing the canvas shows this workspace's own architecture overview
  const overview = useWorkspaceResource<OverviewResponse>(
    currentWorkspaceId,
    'overview',
    getToken,
    true,
    user?.id ?? null
  );
  const graphElements: GraphElements | null =
    canvasElements ?? (overview.status === 'ready' ? overview.data.elements : null);
  const graphStatus =
    overview.status === 'loading'
      ? ({ kind: 'loading' } as const)
      : overview.status === 'error'
        ? ({
            kind: 'error',
            message: overview.code === 503 ? 'No graph, no answer' : overview.message,
          } as const)
        : ({ kind: 'empty', message: 'No components indexed for this workspace' } as const);

  // Example queries, scenario cards and palette entries all come from this workspace's own graph
  const suggestions = useMemo(
    () => buildSuggestions(currentWorkspaceId, overview.status === 'ready' ? overview.data : null),
    [currentWorkspaceId, overview]
  );

  // Briefing -> Files/Diff cross-links
  const highlightComponents = useMemo(
    () => briefingResponse?.briefing?.blastRadius.affectedComponents.map((c) => c.component) ?? [],
    [briefingResponse]
  );
  const citedDecisionIds = useMemo(() => {
    const b = briefingResponse?.briefing;
    if (!b) return [];
    return [...b.precedents.map((p) => p.decisionId), ...b.constrainingDecisions.map((d) => d.decisionId)];
  }, [briefingResponse]);

  // Only open the live-sync stream once we have a token; an unauthenticated connect is a guaranteed 401
  return (
    <GraphSyncProvider workspaceId={authToken ? currentWorkspaceId : undefined} token={authToken}>
      <main className="min-h-screen bg-background text-foreground flex flex-col font-mono">
        {/* Unified Top Navigation Header */}
        <HeaderBar
          suggestions={suggestions}
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
                  <ShowcaseHub
                    onSelectScenario={handleSelectScenario}
                    scenarios={suggestions.scenarios}
                    curated={suggestions.curated}
                    workspaceId={currentWorkspaceId}
                    loading={overview.status === 'loading' && !suggestions.curated}
                  />
                )}
              </div>
            }
            rightPanel={
              <InsightPane
                workspaceId={currentWorkspaceId}
                highlightComponents={highlightComponents}
                citedDecisionIds={citedDecisionIds}
                graph={
                  <GraphCanvas
                    key={currentWorkspaceId}
                    elements={graphElements}
                    status={canvasElements ? undefined : graphStatus}
                  />
                }
              />
            }
          />
        </div>
      </main>
    </GraphSyncProvider>
  );
}
