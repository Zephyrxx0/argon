'use client';

import React from 'react';
import { clsx } from 'clsx';
import type { NodeKind } from '@/lib/graph/model';

const ENTRIES: Array<{ kind: NodeKind; label: string; glyph: React.ReactNode }> = [
  { kind: 'component', label: 'Component', glyph: <span className="block h-3 w-3 border-2 border-current" /> },
  { kind: 'decision', label: 'Decision', glyph: <span className="block h-2.5 w-2.5 rotate-45 border border-current" /> },
  { kind: 'person', label: 'Person', glyph: <span className="block h-3 w-3 rounded-full border border-current" /> },
  { kind: 'file', label: 'File', glyph: <span className="block h-2 w-3 border border-current" /> },
];

export interface GraphLegendProps {
  counts: Partial<Record<NodeKind, number>>;
  hidden: Set<NodeKind>;
  onToggle: (kind: NodeKind) => void;
  /** Explains what the current view's edges / caps mean (e.g. the Files view). */
  note?: string;
  className?: string;
}

/** Doubles as the type filter: click an entry to hide/show that kind of node. */
export function GraphLegend({ counts, hidden, onToggle, note, className }: GraphLegendProps) {
  return (
    <div
      data-testid="graph-legend"
      role="group"
      aria-label="Filter by node type"
      className={clsx('absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap border border-white/30 bg-black font-mono', className)}
    >
      {ENTRIES.filter((e) => (counts[e.kind] ?? 0) > 0).map(({ kind, label, glyph }) => {
        const off = hidden.has(kind);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={!off}
            onClick={() => onToggle(kind)}
            data-testid={`legend-${kind}`}
            title={off ? `Show ${label.toLowerCase()}s` : `Hide ${label.toLowerCase()}s`}
            className={clsx(
              'flex items-center gap-2 border-r border-white/20 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors last:border-r-0',
              off ? 'text-white/35 line-through hover:text-white/70' : 'text-white hover:bg-white hover:text-black'
            )}
          >
            {glyph}
            <span>{label}</span>
            <span className="opacity-50">{counts[kind]}</span>
          </button>
        );
      })}
      {note && (
        <span
          data-testid="graph-legend-note"
          className="flex items-center px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/55"
        >
          {note}
        </span>
      )}
    </div>
  );
}
