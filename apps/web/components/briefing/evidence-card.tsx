'use client';

import React from 'react';
import { Crosshair, ExternalLink, ShieldCheck, AlertOctagon, GitCommit, FileCode, Box, User, Users, ArrowRight, GitPullRequest, CircleDot, MessageSquare, Hourglass } from 'lucide-react';
import { useGraphSync } from '@/lib/graph-sync';
import { clsx } from 'clsx';

export type EvidenceNodeType = 'DECISION' | 'COMPONENT' | 'FILE' | 'PERSON' | 'TEAM';

/** A link to where a fact came from (pull request, issue, commit...). */
export interface EvidenceLink {
  kind: 'pull_request' | 'issue' | 'commit' | 'document' | 'decision' | 'chat';
  label: string;
  url: string;
  state?: string;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

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
  /** What the source link points at, when it is not a plain document / commit (e.g. a chat thread). */
  sourceLabel?: string;
  /** The source is invented demo data (the synthetic chat source): say so on the card. */
  sourceSynthetic?: boolean;
  /** Whole days the decision has been in force; with `stale` it drives the age badge. */
  ageDays?: number | null;
  /** In force for longer than the freshness threshold: shows a STALE badge. */
  stale?: boolean;
  /** The threshold behind `stale`, shown in the badge tooltip. */
  staleAfterDays?: number;
  /** Where this node was extracted from: its pull request and the issue that PR closed. */
  links?: EvidenceLink[];
  /** Hide the validity badge (people / teams are not "in force"). */
  hideValidity?: boolean;
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
  sourceLabel,
  sourceSynthetic = false,
  ageDays,
  stale = false,
  staleAfterDays,
  links,
  hideValidity = false,
  properties,
  className,
}: EvidenceCardProps) {
  const { hoveredNodeId, selectedNodeId, setHoveredNode, focusNode } = useGraphSync();

  const cleanId = id.startsWith('#') ? id.slice(1) : id;
  // Links come from graph properties, but a card never renders a non-http(s) href
  const safeSourceUrl = isHttpUrl(sourceUrl) ? sourceUrl : undefined;
  const safeLinks = (links ?? []).filter((l) => isHttpUrl(l.url));
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
          badge: 'border-foreground/40 bg-foreground/5 text-foreground',
          icon: <FileCode className="w-3 h-3 text-foreground" />,
        };
      case 'PERSON':
        return {
          badge: 'border-foreground/40 bg-foreground/5 text-foreground',
          icon: <User className="w-3 h-3 text-foreground" />,
        };
      case 'TEAM':
        return {
          badge: 'border-foreground/40 bg-foreground/5 text-foreground',
          icon: <Users className="w-3 h-3 text-foreground" />,
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
          ? 'border-accent bg-card ring-1 ring-accent'
          : isHovered
          ? 'border-accent/80 bg-card'
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

          {/* Freshness: only decisions in force for longer than the threshold are flagged */}
          {stale && ageDays != null && (
            <span
              data-testid="evidence-stale-badge"
              title={`In force for ${ageDays} days${staleAfterDays ? ` (more than ${staleAfterDays})` : ''}: check it still holds`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-warning/60 bg-warning/10 text-warning"
            >
              <Hourglass className="w-2.5 h-2.5" aria-hidden="true" />
              <span>Stale · {ageDays}d</span>
            </span>
          )}

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
          {hideValidity ? null : validity === 'SUPERSEDED' ? (
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
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-success border border-success/40 bg-success/10"
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

      {/* Provenance: the pull request / issue this node was extracted from */}
      {safeLinks.length > 0 && (
        <div data-testid="evidence-provenance" className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="text-muted-foreground/70 uppercase tracking-wider">Extracted from</span>
          {safeLinks.map((l) => (
            <a
              key={`${l.kind}:${l.url}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`evidence-link-${l.kind}`}
              title={l.label}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-border bg-background/50 text-foreground hover:border-accent hover:text-accent transition-colors"
            >
              {l.kind === 'issue' ? <CircleDot className="w-3 h-3" /> : <GitPullRequest className="w-3 h-3" />}
              <span>{l.label.length > 38 ? `${l.label.slice(0, 37)}…` : l.label}</span>
              {l.state && <span className="text-muted-foreground">({l.state})</span>}
            </a>
          ))}
        </div>
      )}

      {/* Footer Actions: Provenance Source Link & Focus In Graph */}
      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-3 text-xs">
        {safeSourceUrl ? (
          <a
            href={safeSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="evidence-source-link"
            data-synthetic={sourceSynthetic || undefined}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition-colors truncate max-w-[260px]"
          >
            {sourceLabel ? <MessageSquare className="w-3 h-3 shrink-0" aria-hidden="true" /> : <ExternalLink className="w-3 h-3 shrink-0" />}
            <span className="truncate">{sourceLabel ?? 'Source Provenance'}</span>
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
