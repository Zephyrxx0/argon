'use client';

import React, { useRef, useState } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { ChevronLeft, ChevronRight, GripVertical, FileText, Network } from 'lucide-react';
import { clsx } from 'clsx';

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
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<'briefing' | 'canvas'>('briefing');


  const toggleLeftPanel = () => {
    const panel = leftPanelRef.current;
    try {
      if (isLeftCollapsed) {
        panel?.expand();
        setIsLeftCollapsed(false);
      } else {
        panel?.collapse();
        setIsLeftCollapsed(true);
      }
    } catch {
      setIsLeftCollapsed(!isLeftCollapsed);
    }
  };

  const toggleRightPanel = () => {
    const panel = rightPanelRef.current;
    try {
      if (isRightCollapsed) {
        panel?.expand();
        setIsRightCollapsed(false);
      } else {
        panel?.collapse();
        setIsRightCollapsed(true);
      }
    } catch {
      setIsRightCollapsed(!isRightCollapsed);
    }
  };

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
          {leftPanel}
        </div>
        <div
          data-testid="mobile-canvas-container"
          className={clsx('h-full w-full overflow-hidden', mobileTab === 'canvas' ? 'block' : 'hidden')}
        >
          {rightPanel}
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
            ref={leftPanelRef}
            defaultSize={defaultLayout[0]}
            minSize={25}
            maxSize={75}
            collapsible
            collapsedSize={0}
            onCollapse={() => setIsLeftCollapsed(true)}
            onExpand={() => setIsLeftCollapsed(false)}
            className="h-full bg-background overflow-hidden relative"
            data-testid="desktop-briefing-panel"
          >
            <div className="h-full w-full overflow-y-auto">
              {leftPanel}
            </div>
          </Panel>

          {/* Cyberpunk Resizable Split Handle with Collapse Controls */}
          <PanelResizeHandle
            className="relative flex items-center justify-center w-2 bg-muted hover:bg-muted-foreground/20 transition-colors cursor-col-resize group border-x border-border select-none"
            data-testid="viewport-resize-handle"
          >
            {/* Center drag grip indicator */}
            <div className="z-10 flex flex-col items-center justify-center pointer-events-none text-muted-foreground group-hover:text-accent">
              <GripVertical className="w-3 h-3" />
            </div>

            {/* Collapse toggle buttons floating near top */}
            <div className="absolute top-4 flex flex-col gap-1 z-20">
              {/* Collapse Left Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLeftPanel();
                }}
                title={isLeftCollapsed ? 'Expand Briefing Panel' : 'Collapse Briefing Panel'}
                data-testid="toggle-left-panel"
                className="p-0.5 border border-border bg-card text-muted-foreground hover:text-accent hover:border-accent transition-colors"
              >
                <ChevronLeft className={clsx('w-3 h-3 transition-transform', isLeftCollapsed && 'rotate-180')} />
              </button>

              {/* Collapse Right Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRightPanel();
                }}
                title={isRightCollapsed ? 'Expand Graph Canvas' : 'Collapse Graph Canvas'}
                data-testid="toggle-right-panel"
                className="p-0.5 border border-border bg-card text-muted-foreground hover:text-accent hover:border-accent transition-colors"
              >
                <ChevronRight className={clsx('w-3 h-3 transition-transform', isRightCollapsed && 'rotate-180')} />
              </button>
            </div>
          </PanelResizeHandle>

          {/* Right Panel: Cytoscape Graph Canvas */}
          <Panel
            ref={rightPanelRef}
            defaultSize={defaultLayout[1]}
            minSize={25}
            maxSize={75}
            collapsible
            collapsedSize={0}
            onCollapse={() => setIsRightCollapsed(true)}
            onExpand={() => setIsRightCollapsed(false)}
            className="h-full bg-card overflow-hidden relative"
            data-testid="desktop-canvas-panel"
          >
            <div className="h-full w-full overflow-hidden">
              {rightPanel}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
