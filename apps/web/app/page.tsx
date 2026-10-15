'use client';

import React, { useState } from 'react';
import { SplitViewport } from '@/components/layout/split-viewport';
import { ShowcaseHub } from '@/components/hub/showcase-hub';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import { HeaderBar } from '@/components/navigation/header-bar';
import { GraphSyncProvider } from '@/lib/graph-sync';
import { type Workspace } from '@/components/workspace/workspace-switcher';
import { Network, Cpu, Database } from 'lucide-react';

export default function HomePage() {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('ember-adr-showcase');
  const [currentContributorId, setCurrentContributorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [briefingResponse, setBriefingResponse] = useState<WebBriefingResponse | null>(null);

  const executeBriefing = async (task: string) => {
    setSelectedTask(task);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          workspaceId: currentWorkspaceId,
          contributorId: currentContributorId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
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
    } catch (err: any) {
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
    executeBriefing(query);
  };

  const handleQuerySubmit = (query: string) => {
    executeBriefing(query);
  };

  const handleIngestSuccess = (newWorkspace: Workspace) => {
    setCurrentWorkspaceId(newWorkspace.id);
  };

  const handleRetryConnection = () => {
    if (selectedTask) {
      executeBriefing(selectedTask);
    }
  };

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
          onSelectWorkspace={setCurrentWorkspaceId}
          onIngestSuccess={handleIngestSuccess}
          currentContributorId={currentContributorId}
          onSelectContributor={setCurrentContributorId}
        />

        {/* Main Dual-Pane Resizable Viewport */}
        <div className="flex-1 overflow-hidden">
          <SplitViewport
            leftPanel={
              <div className="h-full bg-background">
                {isLoading || briefingResponse ? (
                  <BriefingView
                    response={briefingResponse}
                    isLoading={isLoading}
                    onRetryConnection={handleRetryConnection}
                  />
                ) : (
                  <ShowcaseHub onSelectScenario={handleSelectScenario} />
                )}
              </div>
            }
            rightPanel={
              <div className="h-full w-full bg-card/60 flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden">
                {/* Subtle cyber background grid lines */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, #30363d 1px, transparent 1px), linear-gradient(to bottom, #30363d 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />

                <div className="z-10 max-w-md border border-border bg-card p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-center gap-2 text-accent">
                    <Network className="h-6 w-6 animate-pulse" />
                    <span className="text-xs font-bold tracking-widest uppercase">
                      CYTOSCAPE GRAPH CANVAS
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
                      Topological Canvas Standby
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Graph canvas connects to FalkorDB GraphBLAS matrix engine. When a briefing query is triggered, multi-hop traversal subgraphs will render here in 60fps physics layout.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-muted-foreground border-t border-border/80">
                    <div className="border border-border/50 bg-background/50 p-2 flex items-center gap-1.5 justify-center">
                      <Database className="w-3.5 h-3.5 text-warning" />
                      <span>FalkorDB Matrix</span>
                    </div>
                    <div className="border border-border/50 bg-background/50 p-2 flex items-center gap-1.5 justify-center">
                      <Cpu className="w-3.5 h-3.5 text-accent" />
                      <span>fCoSE Physics</span>
                    </div>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </main>
    </GraphSyncProvider>
  );
}
