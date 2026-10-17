'use client';

import React from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';

export interface ForbiddenCardProps {
  workspaceId?: string;
  reason?: string;
  onSelectWorkspace?: (workspaceId: string) => void;
  className?: string;
}

export function ForbiddenCard({
  workspaceId = 'current',
  reason,
  onSelectWorkspace,
  className,
}: ForbiddenCardProps) {
  const displayCopy =
    reason ||
    `Workspace access denied: You do not have permissions for workspace '${workspaceId}'. Request access from the workspace owner or switch to a showcase workspace.`;

  return (
    <div
      data-testid="forbidden-access-card"
      className={clsx(
        'm-4 sm:m-6 border-2 border-danger bg-card text-danger font-mono p-5 sm:p-6 space-y-4 animate-in fade-in duration-200',
        className
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-danger/30 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 animate-pulse shrink-0 text-danger" />
          <h2
            data-testid="forbidden-title"
            className="text-sm sm:text-base font-black tracking-wider uppercase"
          >
            ARGON // 403 FORBIDDEN
          </h2>
        </div>
        <span
          data-testid="forbidden-badge"
          className="px-2 py-0.5 text-[10px] font-bold tracking-wider border border-danger bg-danger/10 uppercase"
        >
          ACCESS DENIED
        </span>
      </div>

      {/* Error Body */}
      <div className="space-y-2">
        <p data-testid="forbidden-body" className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-mono">
          {displayCopy}
        </p>
      </div>

      {/* Recovery CTA */}
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-danger/30">
        <button
          type="button"
          data-testid="switch-to-showcase-btn"
          onClick={() => onSelectWorkspace?.('ember-adr-showcase')}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold border border-danger bg-danger/10 text-danger hover:bg-danger hover:text-background transition-colors uppercase tracking-wider cursor-pointer"
        >
          <span>Switch to Showcase</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export interface NotFoundCardProps {
  workspaceId?: string;
  reason?: string;
  className?: string;
}

export function NotFoundCard({
  workspaceId = 'current',
  reason,
  className,
}: NotFoundCardProps) {
  const displayCopy = reason || `Workspace '${workspaceId}' not found.`;

  return (
    <div
      data-testid="not-found-banner"
      className={clsx(
        'm-4 sm:m-6 border-2 border-warning bg-card text-warning font-mono p-5 sm:p-6 space-y-4 animate-in fade-in duration-200',
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-warning/30 pb-3">
        <ShieldAlert className="w-5 h-5 shrink-0 text-warning" />
        <h2 className="text-sm sm:text-base font-black tracking-wider uppercase">
          ARGON // 404 NOT FOUND
        </h2>
      </div>
      <p data-testid="not-found-body" className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-mono">
        {displayCopy}
      </p>
    </div>
  );
}
