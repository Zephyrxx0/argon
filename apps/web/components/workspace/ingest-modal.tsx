'use client';

import React, { useState, useEffect } from 'react';
import { GitBranch, Loader2, CheckCircle2, AlertTriangle, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import type { Workspace } from './workspace-switcher';

export interface IngestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIngestComplete: (workspace: Workspace) => void;
}

export interface IngestStep {
  id: string;
  label: string;
  detail: string;
}

const INGEST_STEPS: IngestStep[] = [
  { id: 'cloning', label: 'CLONING', detail: 'Shallow blobless git clone & commit graph extraction' },
  { id: 'mining', label: 'DERIVING', detail: 'Co-change matrix analysis & architectural component clustering' },
  { id: 'decisions', label: 'EMBEDDING', detail: 'Mining ADR/RFC decision records & 512-d Matryoshka vectors' },
  { id: 'ready', label: 'READY', detail: 'Writing GraphBLAS topological nodes to FalkorDB instance' },
];

/**
 * Validates public HTTPS git repository URLs and rejects SSRF vectors,
 * file schemes, private IP ranges, and invalid hostnames (Threat T-04-03).
 */
export function validateGitUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'Repository URL is required' };
  }

  // Must begin with https://
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'Only secure public https:// repository URLs are permitted' };
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopbacks, link-local, private IPs
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { valid: false, error: 'Private and loopback network addresses are blocked (SSRF Protection)' };
    }

    // Must have a path with at least an owner and repository
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return { valid: false, error: 'URL must specify an organization and repository path (e.g. https://github.com/org/repo)' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Malformed URL format' };
  }
}

export function IngestModal({ open, onOpenChange, onIngestComplete }: IngestModalProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setRepoUrl('');
      setValidationError(null);
      setIsIngesting(false);
      setCurrentStepIndex(0);
    }
  }, [open]);

  const handleStartIngest = () => {
    const check = validateGitUrl(repoUrl);
    if (!check.valid) {
      setValidationError(check.error || 'Invalid repository URL');
      return;
    }

    setValidationError(null);
    setIsIngesting(true);
    setCurrentStepIndex(0);

    // Simulated multi-step ingestion lifecycle
    const timer1 = setTimeout(() => setCurrentStepIndex(1), 700);
    const timer2 = setTimeout(() => setCurrentStepIndex(2), 1400);
    const timer3 = setTimeout(() => setCurrentStepIndex(3), 2100);
    const timer4 = setTimeout(() => {
      setIsIngesting(false);
      try {
        const parsed = new URL(repoUrl.trim());
        const segments = parsed.pathname.split('/').filter(Boolean);
        const repoName = segments[segments.length - 1].replace(/\.git$/, '');
        const newWorkspace: Workspace = {
          id: `custom-${repoName.toLowerCase()}-${Date.now().toString(36)}`,
          name: `${segments[segments.length - 2]}/${repoName}`,
          repoUrl: repoUrl.trim(),
          nodeCount: 142,
        };
        onIngestComplete(newWorkspace);
        onOpenChange(false);
      } catch {
        onOpenChange(false);
      }
    }, 2800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ingest Git Repository"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm font-mono animate-in fade-in duration-150"
      onClick={() => !isIngesting && onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg border border-border bg-card shadow-[0_0_60px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="ingest-modal"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2 text-accent">
            <GitBranch className="w-4 h-4" />
            <span className="text-xs font-bold tracking-widest uppercase">
              ARGON // REPOSITORY INGESTION PIPELINE
            </span>
          </div>
          {!isIngesting && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              data-testid="close-ingest-modal"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {!isIngesting ? (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="git-url-input"
                  className="block text-xs font-bold uppercase tracking-wider text-foreground"
                >
                  Target Git Repository URL (HTTPS)
                </label>
                <div className="relative">
                  <input
                    id="git-url-input"
                    type="url"
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="https://github.com/organization/repository"
                    data-testid="ingest-url-input"
                    className="w-full p-2.5 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-accent font-mono"
                  />
                </div>
                {validationError && (
                  <div
                    data-testid="ingest-validation-error"
                    className="flex items-center gap-1.5 text-xs text-danger pt-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-normal pt-1">
                  Argon performs a shallow blobless clone, extracts commit co-change coupling, clusters architectural components, and generates 512-d Matryoshka embeddings without requiring repository push access.
                </p>
              </div>

              {/* Security notice */}
              <div className="p-3 border border-border/80 bg-muted/20 flex items-start gap-2.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>
                  Guest-first isolation: Ingested workspace graph is stored in your active FalkorDB instance and tied to your guest session.
                </span>
              </div>
            </>
          ) : (
            /* Active Ingestion Progress Display */
            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-accent font-bold uppercase tracking-wider flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>EXECUTING INGESTION PIPELINE...</span>
                </span>
                <span className="text-muted-foreground text-[11px]">
                  STEP {currentStepIndex + 1} OF {INGEST_STEPS.length}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted border border-border overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${((currentStepIndex + 1) / INGEST_STEPS.length) * 100}%` }}
                />
              </div>

              {/* Steps checklist */}
              <div className="space-y-3 pt-2">
                {INGEST_STEPS.map((step, idx) => {
                  const isCurrent = idx === currentStepIndex;
                  const isDone = idx < currentStepIndex;
                  return (
                    <div
                      key={step.id}
                      className={clsx(
                        'flex items-start gap-3 p-2.5 border text-xs transition-colors',
                        isCurrent
                          ? 'border-accent bg-accent/10 text-foreground'
                          : isDone
                          ? 'border-border/60 bg-muted/20 text-muted-foreground'
                          : 'border-border/30 bg-transparent text-muted-foreground/40'
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                        ) : isCurrent ? (
                          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                        ) : (
                          <div className="w-3.5 h-3.5 border border-border rounded-full" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <div className="font-bold tracking-wider uppercase text-[11px]">
                          [{step.label}]
                        </div>
                        <div className="text-[11px] leading-tight opacity-90">
                          {step.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        {!isIngesting && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border bg-card transition-colors"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleStartIngest}
              data-testid="submit-ingest-button"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-background bg-accent hover:bg-accent/90 transition-colors uppercase tracking-wider"
            >
              <span>INGEST REPOSITORY</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
