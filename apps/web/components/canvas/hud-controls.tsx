'use client';

import React, { useState } from 'react';
import type { Core } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Filter, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { useGraphSync } from '@/lib/graph-sync';

export interface HudControlsProps {
  cy: Core | null;
  onFilterChange?: (filterMode: 'all' | 'cited-only') => void;
  className?: string;
}

export function HudControls({ cy, onFilterChange, className }: HudControlsProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'cited-only'>('all');
  const { syncBadgeText } = useGraphSync();

  const handleZoomIn = () => {
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * 1.25,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const handleZoomOut = () => {
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * 0.8,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const handleFit = () => {
    if (!cy) return;
    cy.animate({
      fit: { eles: cy.elements(), padding: 40 },
      duration: 300,
    });
  };

  const handleReRunLayout = () => {
    if (!cy) return;
    try {
      const layout = cy.layout({
        name: 'fcose',
        animate: true,
        animationDuration: 400,
        fit: true,
        padding: 40,
      } as any);
      layout.run();
    } catch {
      const fallback = cy.layout({ name: 'cose', animate: false } as any);
      fallback.run();
    }
  };

  const toggleFilter = () => {
    const nextMode = filterMode === 'all' ? 'cited-only' : 'all';
    setFilterMode(nextMode);
    onFilterChange?.(nextMode);

    if (cy) {
      if (nextMode === 'cited-only') {
        cy.elements().forEach((ele) => {
          if (!ele.hasClass('highlighted')) {
            ele.addClass('dimmed');
          }
        });
      } else {
        cy.elements().removeClass('dimmed');
      }
    }
  };

  const handleExportSnapshot = () => {
    if (!cy) return;
    try {
      const pngData = cy.png({ bg: '#090a0f', full: true, scale: 2 });
      const a = document.createElement('a');
      a.href = pngData;
      a.download = `argon-subgraph-${Date.now()}.png`;
      a.click();
    } catch {
      // Export fallback
    }
  };

  return (
    <div
      data-testid="hud-controls"
      className={clsx(
        'absolute bottom-4 right-4 z-30 flex items-center gap-1.5 p-1 border border-border bg-card/90 backdrop-blur-md shadow-2xl font-mono select-none',
        className
      )}
    >
      {/* Live Incremental Sync Badge (Task 08-03-03, SYNC-03) */}
      {syncBadgeText && (
        <>
          <div
            data-testid="hud-live-sync-badge"
            className="flex items-center gap-1.5 px-2 py-1 bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 text-[10px] tracking-wider animate-pulse transition-opacity duration-500"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff]" />
            <span>{syncBadgeText}</span>
          </div>
          <div className="w-[1px] h-4 bg-border mx-0.5" />
        </>
      )}

      {/* Zoom In */}
      <button
        type="button"
        onClick={handleZoomIn}
        data-testid="hud-zoom-in"
        title="Zoom In"
        className="p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/40 transition-colors"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      {/* Zoom Out */}
      <button
        type="button"
        onClick={handleZoomOut}
        data-testid="hud-zoom-out"
        title="Zoom Out"
        className="p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/40 transition-colors"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      {/* Fit to View */}
      <button
        type="button"
        onClick={handleFit}
        data-testid="hud-fit-view"
        title="Fit View"
        className="p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/40 transition-colors"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-4 bg-border mx-0.5" />

      {/* Re-run Layout */}
      <button
        type="button"
        onClick={handleReRunLayout}
        data-testid="hud-rerun-layout"
        title="Re-run fcose physics layout"
        className="p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/40 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>

      {/* Subgraph Filter Toggle */}
      <button
        type="button"
        onClick={toggleFilter}
        data-testid="hud-filter-toggle"
        title={filterMode === 'all' ? 'Filter: All Elements' : 'Filter: Cited Only'}
        className={clsx(
          'flex items-center gap-1 px-1.5 py-1 text-[10px] font-bold border transition-colors',
          filterMode === 'cited-only'
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )}
      >
        <Filter className="w-3 h-3" />
        <span className="hidden sm:inline">{filterMode === 'all' ? 'ALL' : 'CITED'}</span>
      </button>

      <div className="w-[1px] h-4 bg-border mx-0.5" />

      {/* Export Snapshot */}
      <button
        type="button"
        onClick={handleExportSnapshot}
        data-testid="hud-export-snapshot"
        title="Export PNG snapshot"
        className="p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/40 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
