'use client';

import React from 'react';
import { Crosshair, ExternalLink, ShieldCheck, AlertOctagon, GitCommit, FileCode, Box, User, ArrowRight } from 'lucide-react';
import { useGraphSync } from '@/lib/graph-sync';
import { clsx } from 'clsx';

export type EvidenceNodeType = 'DECISION' | 'COMPONENT' | 'FILE' | 'PERSON';

export interface EvidenceCardProps {
  id: string;
  type: EvidenceNodeType;
  title: string;
  description?: string;
  validity?: 'VALID' | 'SUPERSEDED' | 'ACTIVE';
  validFrom?: string;
  validTo?: string;
  supersededBy?: string;
  sourceUrl?: string;
  properties?: Record<string, string | number | boolean>;
  className?: string;
}

export function EvidenceCard({
  id,
  type,
  title,
  description,
  validity = 'VALID',
  validFrom,
  validTo,
  supersededBy,
  sourceUrl,
  properties,
  className,
}: EvidenceCardProps) {
  const { hoveredNodeId, selectedNodeId, setHoveredNode, focusNode } = useGraphSync();

  const cleanId = id.startsWith('#') ? id.slice(1) : id;
  const isHovered = hoveredNodeId === cleanId || hoveredNodeId === id;
  const isSelected = selectedNodeId === cleanId || selectedNodeId === id;

  const getTypeStyle = (t: EvidenceNodeType) => {
    switch (t) {
      case 'DECISION':
        return {
          badge: 'border-warning/50 bg-warning/10 text-warning',
          icon: <GitCommit className="w-3 h-3 text-warning" />,
        };
      case 'COMPONENT':
        return {
          badge: 'border-accent/50 bg-accent/10 text-accent',
          icon: <Box className="w-3 h-3 text-accent" />,
        };
      case 'FILE':
        return {
          badge: 'border-blue-400/50 bg-blue-500/10 text-blue-400',
          icon: <FileCode className="w-3 h-3 text-blue-400" />,
        };
      case 'PERSON':
        return {
          badge: 'border-purple-400/50 bg-purple-500/10 text-purple-400',
          icon: <User className="w-3 h-3 text-purple-400" />,
        };
    }
  };

  const typeConfig = getTypeStyle(type);

  return (
    <div
      onMouseEnter={() => setHoveredNode(cleanId)}
      onMouseLeave={() => setHoveredNode(null)}
      data-testid={`evidence-card-${cleanId}`}
      className={clsx(
        'border bg-card p-4 font-mono transition-all duration-150 relative space-y-3',
        isSelected
          ? 'border-accent shadow-[0_0_15px_rgba(0,240,255,0.25)] bg-card ring-1 ring-accent'
          : isHovered
          ? 'border-accent/80 shadow-[0_0_10px_rgba(0,240,255,0.15)] bg-card'
          : 'border-border hover:border-border/80',
        validity === 'SUPERSEDED' && 'opacity-85 border-l-2 border-l-danger',
        className
      )}
    >
      {/* Header Bar: Type Badge, FalkorDB ID, Temporal Status */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Type Badge */}
          <span
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
              typeConfig.badge
            )}
          >
            {typeConfig.icon}
            <span>{type}</span>
          </span>

          {/* Node ID Badge */}
          <code
            data-testid="evidence-node-id"
            className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 border border-border/80"
          >
            #{cleanId}
          </code>
        </div>

        {/* Temporal Validity Badge & Range */}
        <div className="flex items-center gap-2">
          {(validFrom || validTo) && (
            <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
              [{validFrom ?? 'origin'} → {validTo ?? 'present'}]
            </span>
          )}
          {validity === 'SUPERSEDED' ? (
            <span
              data-testid="evidence-superseded-badge"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-danger border border-danger/40 bg-danger/10"
            >
              <AlertOctagon className="w-2.5 h-2.5" />
              <span className="line-through">SUPERSEDED</span>
              {supersededBy && (
                <span className="ml-1 flex items-center gap-0.5 font-mono">
                  <ArrowRight className="w-2.5 h-2.5" />
                  <span>#{supersededBy}</span>
                </span>
              )}
            </span>
          ) : (
            <span
              data-testid="evidence-valid-badge"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/40 bg-emerald-500/10"
            >
              <ShieldCheck className="w-2.5 h-2.5" />
              <span>VALID IN FORCE</span>
            </span>
          )}
        </div>
      </div>

      {/* Title & Assertion Body */}
      <div className="space-y-1">
        <h4 className="text-sm font-bold text-foreground leading-snug tracking-tight">
          {title}
        </h4>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {description}
          </p>
        )}
      </div>

      {/* Properties metadata pill list */}
      {properties && Object.keys(properties).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] text-muted-foreground">
          {Object.entries(properties).map(([k, v]) => (
            <span
              key={k}
              className="px-1.5 py-0.5 border border-border bg-background/50"
            >
              <span className="text-muted-foreground/70">{k}: </span>
              <span className="text-foreground">{String(v)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Footer Actions: Provenance Source Link & Focus In Graph */}
      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-3 text-xs">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="evidence-source-link"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition-colors truncate max-w-[200px]"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">Source Provenance</span>
          </a>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic">
            FalkorDB Verified
          </span>
        )}

        <button
          type="button"
          onClick={() => focusNode(cleanId)}
          data-testid="focus-in-graph-button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-accent border border-accent/40 bg-accent/10 hover:bg-accent/20 hover:border-accent transition-colors uppercase tracking-wider cursor-pointer"
        >
          <Crosshair className="w-3 h-3" />
          <span>Focus in Graph</span>
        </button>
      </div>
    </div>
  );
}
