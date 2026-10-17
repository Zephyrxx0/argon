'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical, FileText, Network } from 'lucide-react';
import { clsx } from 'clsx';

const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * True at the `md` breakpoint and above. The server (and first hydration pass) assumes
 * desktop, which is also what the default layout renders.
 */
export function useIsDesktop(query: string = DESKTOP_QUERY): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true),
    () => true
  );
}

export interface SplitViewportProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLayout?: [number, number];
  className?: string;
}

export function SplitViewport({
  leftPanel,
  rightPanel,
  defaultLayout = [45, 55],
  className,
}: SplitViewportProps) {
  const [mobileTab, setMobileTab] = useState<'briefing' | 'canvas'>('briefing');
  // Panels hold heavy, stateful components (graph canvas, file tree, data fetches). Mount them in
  // ONE layout only; the other layout keeps its (empty) chrome so nothing is rendered twice.
  const isDesktop = useIsDesktop();




  return (
    <div className={clsx('flex flex-col w-full h-[calc(100vh-4rem)] overflow-hidden font-mono bg-background', className)}>
      {/* Mobile Tab Switcher (Visible below md breakpoint) */}
      <div className="flex md:hidden border-b border-border bg-card p-2 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('briefing')}
          data-testid="tab-briefing"
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold uppercase tracking-wider transition-colors border',
            mobileTab === 'briefing'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>[BRIEFING]</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('canvas')}
          data-testid="tab-canvas"
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold uppercase tracking-wider transition-colors border',
            mobileTab === 'canvas'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
          )}
        >
          <Network className="w-3.5 h-3.5" />
          <span>[GRAPH CANVAS]</span>
        </button>
      </div>

      {/* Mobile Active Content Panel */}
      <div className="flex-1 md:hidden overflow-hidden relative">
        <div
          data-testid="mobile-briefing-container"
          className={clsx('h-full w-full overflow-y-auto', mobileTab === 'briefing' ? 'block' : 'hidden')}
        >
          {!isDesktop && leftPanel}
        </div>
        <div
          data-testid="mobile-canvas-container"
          className={clsx('h-full w-full overflow-hidden', mobileTab === 'canvas' ? 'block' : 'hidden')}
        >
          {!isDesktop && rightPanel}
        </div>
      </div>

      {/* Desktop Split Viewport (Visible on md and above) */}
      <div className="hidden md:flex flex-1 w-full h-full overflow-hidden relative">
        <PanelGroup
          direction="horizontal"
          autoSaveId="argon-viewport-layout"
          className="w-full h-full"
        >
          {/* Left Panel: Briefing Stream */}
          <Panel
            defaultSize={defaultLayout[0]}
            minSize={25}
            maxSize={75}
            className="h-full bg-background overflow-hidden relative"
            data-testid="desktop-briefing-panel"
          >
            <div className="h-full w-full overflow-y-auto">
              {isDesktop && leftPanel}
            </div>
          </Panel>

          {/* Resizable Split Handle with Collapse Controls */}
          <PanelResizeHandle
            className="relative flex items-center justify-center w-2 bg-muted hover:bg-muted-foreground/20 transition-colors cursor-col-resize group border-x border-border select-none"
            data-testid="viewport-resize-handle"
          >
            {/* Center drag grip indicator */}
            <div className="z-10 flex flex-col items-center justify-center pointer-events-none text-muted-foreground group-hover:text-accent">
              <GripVertical className="w-3 h-3" />
            </div>

          </PanelResizeHandle>

          {/* Right Panel: Graph / Files / Diff */}
          <Panel
            defaultSize={defaultLayout[1]}
            minSize={25}
            maxSize={75}
            className="h-full bg-card overflow-hidden relative"
            data-testid="desktop-canvas-panel"
          >
            <div className="h-full w-full overflow-hidden">
              {isDesktop && rightPanel}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
