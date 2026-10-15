'use client';

import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, ChevronDown, Terminal, Database } from 'lucide-react';
import { clsx } from 'clsx';

export interface KillSwitchCardProps {
  status?: string;
  reason?: string;
  droppedCitationCount?: number;
  diagnosticDetails?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function KillSwitchCard({
  status = 'CITATION_INTEGRITY_FAILURE',
  reason,
  droppedCitationCount = 0,
  diagnosticDetails,
  onRetry,
  isRetrying = false,
  className,
}: KillSwitchCardProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const isTimeout = status === 'FALKORDB_TIMEOUT' || status === '503';

  const defaultCopy = isTimeout
    ? 'FalkorDB Graph Unreachable (503): Database connection timed out or direct VPC egress failed. Verify gateway credentials and network access.'
    : 'No Graph, No Answer: Refusing to present briefing because 0 verified graph citations could be proven for the generated claims.';

  const displayCopy = reason || defaultCopy;

  return (
    <div
      data-testid="kill-switch-card"
      className={clsx(
        'm-4 sm:m-6 border-2 border-danger bg-danger/5 font-mono p-5 sm:p-6 relative shadow-[0_0_30px_rgba(255,0,85,0.25)] space-y-4 animate-in fade-in zoom-in-95 duration-200',
        className
      )}
    >
      {/* Glitch Header Bar */}
      <div className="flex items-center justify-between border-b border-danger/40 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-danger">
          <ShieldAlert className="w-5 h-5 animate-pulse shrink-0" />
          <span className="text-xs font-black tracking-widest uppercase">
            REFUSAL PROTOCOL ACTIVATED // INTEGRITY ENFORCEMENT
          </span>
        </div>

        <span
          data-testid="kill-switch-badge"
          className="px-2 py-0.5 text-[10px] font-bold tracking-wider text-danger border border-danger bg-danger/20 uppercase"
        >
          {status}
        </span>
      </div>

      {/* Main Title & Refusal Statement */}
      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-black text-danger tracking-tight uppercase">
          No Graph, No Answer
        </h2>

        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-mono">
          {displayCopy}
        </p>
      </div>

      {/* Citation stats callout if applicable */}
      {droppedCitationCount > 0 && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-danger/40 bg-card text-danger font-semibold">
          <Database className="w-3.5 h-3.5" />
          <span>Dropped {droppedCitationCount} uncited node claim{droppedCitationCount === 1 ? '' : 's'}</span>
        </div>
      )}

      {/* Footer Action & Diagnostics Toggle */}
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-danger/30">
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          data-testid="kill-switch-retry-button"
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold text-background bg-danger hover:bg-danger/90 transition-colors uppercase tracking-wider disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
          <span>{isRetrying ? 'RE-TESTING FALKORDB...' : 'Test DB Connection'}</span>
        </button>

        {diagnosticDetails && (
          <button
            type="button"
            onClick={() => setShowDiagnostics((prev) => !prev)}
            data-testid="toggle-diagnostics-button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start sm:self-auto"
          >
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Diagnostic Traceback</span>
            <ChevronDown
              className={clsx(
                'w-3 h-3 transition-transform',
                showDiagnostics && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      {/* Collapsible Traceback / Cypher Error */}
      {showDiagnostics && diagnosticDetails && (
        <div
          data-testid="kill-switch-diagnostics"
          className="p-3 border border-border bg-background text-[11px] text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap break-all leading-tight max-h-48"
        >
          {diagnosticDetails}
        </div>
      )}
    </div>
  );
}

