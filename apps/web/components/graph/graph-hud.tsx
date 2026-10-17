'use client';

import React, { useState } from 'react';
import {
  getNodesBounds,
  useReactFlow,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Download, ArrowRightLeft, ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useGraphSync } from '@/lib/graph-sync';
import type { LayoutDirection } from '@/lib/graph/model';

export interface GraphHudProps {
  direction: LayoutDirection;
  onDirectionChange: (direction: LayoutDirection) => void;
  onRelayout: () => void;
  className?: string;
}

const btn =
  'flex h-8 w-8 items-center justify-center border border-transparent text-white/70 transition-colors hover:border-white hover:bg-white hover:text-black focus-visible:border-white disabled:opacity-40';

/** Floating toolbar: zoom, fit, layout, direction, export, plus the live-sync badge. */
export function GraphHud({ direction, onDirectionChange, onRelayout, className }: GraphHudProps) {
  const { zoomIn, zoomOut, fitView, getNodes } = useReactFlow();
  const { syncBadgeText } = useGraphSync();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const nodes = getNodes();
    // Capture the whole React Flow pane (viewport = nodes layer; edges are a SIBLING <svg>, so
    // rasterizing only the viewport dropped every connection). Rendering the pane keeps both.
    const pane = document.querySelector<HTMLElement>('[data-testid="graph-canvas"] .react-flow');
    const viewport = pane?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!pane || !viewport || nodes.length === 0) return;
    setExporting(true);

    // Size the image to the actual graph (plus margin) so nothing is cropped.
    const margin = 48;
    const bounds = getNodesBounds(nodes);
    const width = Math.max(1, Math.ceil(bounds.width + margin * 2));
    const height = Math.max(1, Math.ceil(bounds.height + margin * 2));
    // Place the content at (margin - bounds.x, margin - bounds.y) at zoom 1, independent of the
    // user's current pan/zoom.
    const transform = `translate(${margin - bounds.x}px, ${margin - bounds.y}px) scale(1)`;
    const previous = viewport.style.transform;

    try {
      viewport.style.transform = transform;
      const dataUrl = await toPng(pane, {
        backgroundColor: '#000000',
        width,
        height,
        pixelRatio: 2,
        // skip the floating overlays (HUD, legend, minimap, inspector) in the exported image
        filter: (node) =>
          !(node instanceof HTMLElement) ||
          !(
            node.dataset?.testid === 'hud-controls' ||
            node.dataset?.testid === 'graph-legend' ||
            node.dataset?.testid === 'node-inspector-popover' ||
            node.classList?.contains('react-flow__minimap') ||
            node.classList?.contains('react-flow__controls') ||
            node.classList?.contains('react-flow__panel')
          ),
        style: { width: `${width}px`, height: `${height}px` },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `argon-graph-${Date.now()}.png`;
      a.click();
    } catch {
      // Export is best-effort
    } finally {
      viewport.style.transform = previous;
      setExporting(false);
    }
  };

  return (
    <div
      data-testid="hud-controls"
      role="toolbar"
      aria-label="Graph controls"
      className={clsx(
        'absolute bottom-4 right-4 z-30 flex items-center gap-0.5 border border-white/30 bg-black p-0.5 font-mono select-none',
        className
      )}
    >
      {syncBadgeText && (
        <>
          <div
            data-testid="hud-live-sync-badge"
            role="status"
            className="flex items-center gap-1.5 border border-white bg-black px-2 py-1 text-[10px] uppercase tracking-wider text-white"
          >
            <span className="h-1.5 w-1.5 animate-pulse bg-white" />
            <span>{syncBadgeText}</span>
          </div>
          <div className="mx-0.5 h-5 w-px bg-white/25" />
        </>
      )}

      <button type="button" className={btn} onClick={() => zoomIn({ duration: 200 })} data-testid="hud-zoom-in" title="Zoom in" aria-label="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => zoomOut({ duration: 200 })} data-testid="hud-zoom-out" title="Zoom out" aria-label="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => fitView({ duration: 300, padding: 0.2 })} data-testid="hud-fit-view" title="Fit to view" aria-label="Fit to view">
        <Maximize2 className="h-4 w-4" />
      </button>

      <div className="mx-0.5 h-5 w-px bg-white/25" />

      <button
        type="button"
        className={btn}
        onClick={() => onDirectionChange(direction === 'LR' ? 'TB' : 'LR')}
        data-testid="hud-direction"
        title={direction === 'LR' ? 'Switch to top-down layout' : 'Switch to left-right layout'}
        aria-label={direction === 'LR' ? 'Switch to top-down layout' : 'Switch to left-right layout'}
      >
        {direction === 'LR' ? <ArrowRightLeft className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />}
      </button>
      <button type="button" className={btn} onClick={onRelayout} data-testid="hud-relayout" title="Re-run layout" aria-label="Re-run layout">
        <RefreshCw className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={handleExport} disabled={exporting} data-testid="hud-export" title="Export PNG" aria-label="Export PNG">
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}
