'use client';

import React from 'react';
import { clsx } from 'clsx';
import { ArrowRight, ShieldAlert, Trash2 } from 'lucide-react';

export interface WorkspaceUnavailableProps {
  workspaceId: string;
  /** HTTP status the workspace endpoint answered with: 404 (gone) or 403 (not yours). */
  status: 404 | 403;
  /** Built-in showcase workspaces cannot be removed from the list. */
  removable: boolean;
  onOpenShowcase: () => void;
  onRemove: () => void;
  className?: string;
}

/**
 * Shown instead of an empty hub when the selected workspace cannot be opened. A remembered
 * workspace can outlive its graph (a different or reset database, a deleted workspace), so the
 * user needs a way out: go back to the showcase, or forget the stale entry.
 */
export function WorkspaceUnavailable({
  workspaceId,
  status,
  removable,
  onOpenShowcase,
  onRemove,
  className,
}: WorkspaceUnavailableProps) {
  const gone = status === 404;
  return (
    <div
      role="alert"
      data-testid="workspace-unavailable"
      data-status={status}
      className={clsx('m-4 sm:m-6 border-2 border-warning bg-card p-5 font-mono space-y-3', className)}
    >
      <div className="flex items-center gap-2 border-b border-warning/30 pb-2 text-warning">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h2 className="text-xs font-black uppercase tracking-wider">
          {gone ? 'Workspace not found' : 'Workspace access denied'}
        </h2>
      </div>
      <p data-testid="workspace-unavailable-message" className="text-xs leading-relaxed text-foreground/90">
        {gone ? (
          <>
            <code className="text-foreground">{workspaceId}</code> does not exist on this server. It may have been
            deleted, or this server uses a different database than the one it was ingested into.
            {removable ? ' Remove it from your list and ingest the repository again if you still need it.' : ''}
          </>
        ) : (
          <>
            You do not have access to <code className="text-foreground">{workspaceId}</code>. It belongs to another
            account or session: sign in with the account that ingested it.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          data-testid="workspace-unavailable-showcase"
          onClick={onOpenShowcase}
          className="inline-flex cursor-pointer items-center gap-2 border border-warning bg-warning/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-warning transition-colors hover:bg-warning hover:text-background"
        >
          Open the showcase
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {removable && (
          <button
            type="button"
            data-testid="workspace-unavailable-remove"
            onClick={onRemove}
            className="inline-flex cursor-pointer items-center gap-2 border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-danger hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove from my list
          </button>
        )}
      </div>
    </div>
  );
}
