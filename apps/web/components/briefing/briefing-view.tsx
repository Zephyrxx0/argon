'use client';

import React from 'react';
import type { Briefing } from '@argon/agent';
import { StickyJumpBar, type SectionCitationCounts } from './sticky-jump-bar';
import { EvidenceCard } from './evidence-card';
import { KillSwitchCard } from './kill-switch-card';
import { Loader2, Layers, GitFork, Users, ShieldAlert, History } from 'lucide-react';
import { clsx } from 'clsx';

export interface WebBriefingResponse {
  status: 'SUCCESS' | 'NO_GRAPH_DATA' | 'CITATION_INTEGRITY_FAILURE' | 'ERROR' | 'FALKORDB_TIMEOUT';
  briefingId?: string;
  briefing?: Briefing | null;
  evidence?: {
    nodeCount?: number;
    totalCitedCount?: number;
    verifiedCitationCount?: number;
    strippedClaimCount?: number;
    verifiedNodeIds?: string[];
  } | null;
  reason?: string;
}

export interface BriefingViewProps {
  response: WebBriefingResponse | null;
  isLoading?: boolean;
  onRetryConnection?: () => void;
  className?: string;
}

export function BriefingView({
  response,
  isLoading = false,
  onRetryConnection,
  className,
}: BriefingViewProps) {
  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div
        data-testid="briefing-loading-skeleton"
        className={clsx('p-4 sm:p-6 font-mono space-y-6 max-w-4xl mx-auto', className)}
      >
        <div className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>SYNTHESIZING FALKORDB TRAVERSALS...</span>
        </div>

        {/* 5-Card Brutalist Skeleton Stream */}
        {['SUMMARY', 'BLAST RADIUS', 'KEY OWNERS', 'DECISIONS', 'PRECEDENTS'].map((label) => (
          <div key={label} className="border border-border bg-card/60 p-5 space-y-3 animate-pulse">
            <div className="h-4 w-28 bg-muted border border-border" />
            <div className="h-6 w-3/4 bg-muted/80" />
            <div className="h-4 w-full bg-muted/40" />
            <div className="h-4 w-2/3 bg-muted/40" />
          </div>
        ))}
      </div>
    );
  }

  // 2. Kill-Switch Refusal & Error States
  if (response?.status === 'CITATION_INTEGRITY_FAILURE' || response?.status === 'FALKORDB_TIMEOUT') {
    return (
      <KillSwitchCard
        status={response.status}
        reason={response.reason}
        droppedCitationCount={response.evidence?.strippedClaimCount ?? 0}
        onRetry={onRetryConnection}
      />
    );
  }

  if (response?.status === 'NO_GRAPH_DATA') {
    return (
      <KillSwitchCard
        status="NO_GRAPH_DATA"
        reason={response.reason || 'No matching graph entities found in FalkorDB for the specified scope.'}
        onRetry={onRetryConnection}
      />
    );
  }

  const briefing = response?.briefing;
  if (!briefing) return null;

  // Calculate section citation badge counts
  const summaryCitationCount = briefing.summary.keyTakeaways.reduce(
    (acc, t) => acc + (t.citedNodeIds?.length ?? 0),
    0
  );
  const blastRadiusCitationCount = briefing.blastRadius.affectedComponents.reduce(
    (acc, c) => acc + (c.citedNodeIds?.length ?? 0),
    0
  );
  const keyOwnersCitationCount = briefing.keyOwners.reduce(
    (acc, o) => acc + (o.citedNodeIds?.length ?? 0),
    0
  );
  const decisionsCitationCount = briefing.constrainingDecisions.reduce(
    (acc, d) => acc + (d.citedNodeIds?.length ?? 0),
    0
  );
  const precedentsCitationCount = briefing.precedents.reduce(
    (acc, p) => acc + (p.citedNodeIds?.length ?? 0),
    0
  );

  const counts: SectionCitationCounts = {
    summary: summaryCitationCount,
    blastRadius: blastRadiusCitationCount,
    keyOwners: keyOwnersCitationCount,
    decisions: decisionsCitationCount,
    precedents: precedentsCitationCount,
  };

  return (
    <div
      data-testid="briefing-view"
      className={clsx('flex flex-col font-mono max-w-4xl mx-auto pb-16 relative', className)}
    >
      {/* Sticky Section Jump Bar */}
      <StickyJumpBar counts={counts} />

      <div className="p-4 sm:p-6 space-y-8">
        {/* SECTION 1: SUMMARY */}
        <section id="sec-summary" className="space-y-4 scroll-mt-14">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
              <Layers className="w-4 h-4 text-accent" />
              <span>01 // ARCHITECTURAL SUMMARY</span>
            </div>
            <span
              className={clsx(
                'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
                briefing.summary.riskLevel === 'critical' || briefing.summary.riskLevel === 'high'
                  ? 'border-danger/50 text-danger bg-danger/10'
                  : 'border-accent/40 text-accent bg-accent/10'
              )}
            >
              RISK: {briefing.summary.riskLevel}
            </span>
          </div>

          <div className="border border-border bg-card p-5 space-y-3">
            <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
              {briefing.summary.overview}
            </h3>

            {briefing.summary.keyTakeaways && briefing.summary.keyTakeaways.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/60">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Key Takeaways
                </span>
                <ul className="space-y-2">
                  {briefing.summary.keyTakeaways.map((takeaway, idx) => (
                    <li
                      key={`takeaway-${idx}`}
                      className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2"
                    >
                      <span className="text-accent mt-0.5 font-bold">•</span>
                      <span>{takeaway.claim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 2: BLAST RADIUS */}
        <section id="sec-blast-radius" className="space-y-4 scroll-mt-14">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
              <GitFork className="w-4 h-4 text-accent" />
              <span>02 // BLAST RADIUS ANALYSIS</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-semibold">
              {briefing.blastRadius.affectedComponents.length} AFFECTED COMPONENTS
            </span>
          </div>

          <div className="border border-border bg-card/60 p-4 mb-3">
            <p className="text-xs text-foreground/90 leading-relaxed">
              {briefing.blastRadius.analysis}
            </p>
          </div>

          <div className="space-y-3">
            {briefing.blastRadius.affectedComponents.length === 0 ? (
              <div className="p-4 border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                None recorded in active graph
              </div>
            ) : (
              briefing.blastRadius.affectedComponents.map((comp, idx) => (
                <EvidenceCard
                  key={`comp-${idx}-${comp.component}`}
                  id={comp.citedNodeIds?.[0] || `c:${comp.component}`}
                  type="COMPONENT"
                  title={comp.component}
                  description={comp.reason}
                  properties={{
                    Component: comp.component,
                    Citations: comp.citedNodeIds?.length ?? 0,
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* SECTION 3: KEY OWNERS */}
        <section id="sec-key-owners" className="space-y-4 scroll-mt-14">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
              <Users className="w-4 h-4 text-accent" />
              <span>03 // CODE OWNERS & EXPERTS</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-semibold">
              {briefing.keyOwners.length} IDENTIFIED AUTHORS
            </span>
          </div>

          <div className="space-y-3">
            {briefing.keyOwners.length === 0 ? (
              <div className="p-4 border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                None recorded in active graph
              </div>
            ) : (
              briefing.keyOwners.map((owner, idx) => (
                <EvidenceCard
                  key={`owner-${idx}-${owner.personId}`}
                  id={owner.personId}
                  type="PERSON"
                  title={owner.name}
                  description={`Role: ${owner.role.toUpperCase()} in ${owner.component}. Authored: ${owner.authoredCount} commits, Reviewed: ${owner.reviewedCount} PRs.`}
                  properties={{
                    Role: owner.role.toUpperCase(),
                    Component: owner.component,
                    Commits: owner.authoredCount,
                    Reviews: owner.reviewedCount,
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* SECTION 4: CONSTRAINING DECISIONS */}
        <section id="sec-decisions" className="space-y-4 scroll-mt-14">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-warning" />
              <span>04 // GOVERNING DECISIONS & CONSTRAINTS</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-semibold">
              {briefing.constrainingDecisions.length} ACTIVE DECISIONS
            </span>
          </div>

          <div className="space-y-3">
            {briefing.constrainingDecisions.length === 0 ? (
              <div className="p-4 border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                None recorded in active graph
              </div>
            ) : (
              briefing.constrainingDecisions.map((dec, idx) => (
                <EvidenceCard
                  key={`decision-${idx}-${dec.decisionId}`}
                  id={dec.decisionId}
                  type="DECISION"
                  title={dec.title}
                  description={dec.constraint}
                  validity="VALID"
                  properties={{
                    Status: dec.status,
                    Component: dec.component,
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* SECTION 5: PRECEDENTS */}
        <section id="sec-precedents" className="space-y-4 scroll-mt-14">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
              <History className="w-4 h-4 text-muted-foreground" />
              <span>05 // HISTORICAL PRECEDENTS & SUPERSEDED RFCS</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-semibold">
              {briefing.precedents.length} PRECEDENTS
            </span>
          </div>

          <div className="space-y-3">
            {briefing.precedents.length === 0 ? (
              <div className="p-4 border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                None recorded in active graph
              </div>
            ) : (
              briefing.precedents.map((prec, idx) => (
                <EvidenceCard
                  key={`prec-${idx}-${prec.decisionId}`}
                  id={prec.decisionId}
                  type="DECISION"
                  title={prec.title}
                  description={prec.relevance}
                  validity="SUPERSEDED"
                  properties={{
                    Relevance: prec.relevance,
                    ...(prec.similarityScore !== undefined
                      ? { 'Similarity Score': prec.similarityScore.toFixed(2) }
                      : {}),
                  }}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

