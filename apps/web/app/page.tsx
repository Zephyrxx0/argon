'use client';

import React, { useState } from 'react';
import { SplitViewport } from '@/components/layout/split-viewport';
import { ShowcaseHub } from '@/components/hub/showcase-hub';
import { Terminal, Network, Cpu, Database, Activity } from 'lucide-react';

export default function HomePage() {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const handleSelectScenario = (query: string) => {
    setSelectedTask(query);
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col font-mono">
      {/* Top Navigation Stub (Plan 04-02 expands into full CommandBar & Workspace Switcher) */}
      <header className="h-16 border-b border-border bg-card px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-accent">
            <Terminal className="h-5 w-5" />
            <span className="text-sm font-black tracking-widest uppercase">ARGON // 2077</span>
          </div>
          <span className="hidden sm:inline-block text-xs px-2 py-0.5 border border-border bg-muted/40 text-muted-foreground uppercase">
            Graph Engine v0.1
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {selectedTask ? (
            <div className="flex items-center gap-2">
              <span className="text-accent font-semibold">Active Scope:</span>
              <code className="text-foreground bg-muted px-2 py-0.5 border border-border">
                {selectedTask}
              </code>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-accent animate-pulse" />
              <span>STANDBY — AWAITING QUERY</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Dual-Pane Resizable Viewport */}
      <div className="flex-1 overflow-hidden">
        <SplitViewport
          leftPanel={
            <div className="h-full bg-background">
              <ShowcaseHub onSelectScenario={handleSelectScenario} />
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
  );
}
