'use client';

import React from 'react';
import { X, Compass } from 'lucide-react';
import { clsx } from 'clsx';

export interface InspectedNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface NodeInspectorProps {
  node: InspectedNode | null;
  onClose: () => void;
  className?: string;
}

export function NodeInspector({ node, onClose, className }: NodeInspectorProps) {
  if (!node) return null;

  const cleanId = node.id.startsWith('#') ? node.id.slice(1) : node.id;

  const handleJumpToCard = () => {
    // Attempt to locate card element by data-testid or ID
    const cardEl =
      document.querySelector(`[data-testid="evidence-card-${cleanId}"]`) ||
      document.querySelector(`[data-testid="evidence-card-${node.id}"]`);

    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardEl.classList.add('ring-2', 'ring-accent');
      setTimeout(() => {
        cardEl.classList.remove('ring-2', 'ring-accent');
      }, 2000);
    }
  };

  return (
    <div
      data-testid="node-inspector-popover"
      className={clsx(
        'absolute top-4 left-4 z-30 max-w-sm w-72 border border-accent/60 bg-card/95 backdrop-blur-md shadow-[0_0_20px_rgba(0,240,255,0.2)] font-mono p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150',
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent border border-accent/40 bg-accent/10">
            {node.type}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            #{cleanId}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="close-inspector-button"
          className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Node Title / Label */}
      <div>
        <h4 className="text-xs font-bold text-foreground leading-snug break-words">
          {node.label}
        </h4>
      </div>

      {/* Properties List */}
      {node.properties && Object.keys(node.properties).length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border/40 max-h-36 overflow-y-auto text-[10px]">
          {Object.entries(node.properties).map(([key, val]) => (
            <div key={key} className="flex items-start justify-between gap-2 py-0.5">
              <span className="text-muted-foreground shrink-0">{key}:</span>
              <span className="text-foreground truncate max-w-[140px] font-mono">
                {String(val)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleJumpToCard}
          data-testid="jump-to-card-button"
          className="w-full inline-flex items-center justify-center gap-1.5 py-1 px-2 text-[10px] font-bold text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors uppercase tracking-wider cursor-pointer"
        >
          <Compass className="w-3 h-3" />
          <span>Jump to Cited Claim</span>
        </button>
      </div>
    </div>
  );
}
