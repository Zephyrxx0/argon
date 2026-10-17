'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  GitBranch,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  ShieldCheck,
  FolderGit2,
  Link2,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { Workspace } from './workspace-switcher';
import { RepoPicker, type GitHubRepositoryItem } from './repo-picker';
import { useAuth } from '@/app/providers';
import { AuthModal } from '@/components/auth/auth-modal';
import {
  startPrivateIngest,
  startPublicIngest,
  stepIndexForStatus,
  waitForIngest,
} from '@/lib/ingest-client';

export interface IngestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIngestComplete: (workspace: Workspace) => void;
  onOpenAuth?: () => void;
  initialRepositories?: GitHubRepositoryItem[];
}

export interface IngestStep {
  id: string;
  label: string;
  detail: string;
}

const INGEST_STEPS: IngestStep[] = [
  { id: 'cloning', label: 'CLONING', detail: 'Blobless git clone of recent history with credential scrubbing' },
  { id: 'mining', label: 'DERIVING', detail: 'Co-change matrix analysis & architectural clustering' },
  { id: 'decisions', label: 'EMBEDDING', detail: 'Mining ADR/RFC decisions & 512-d Matryoshka vectors' },
  { id: 'ready', label: 'READY', detail: 'Writing GraphBLAS topological nodes to FalkorDB instance' },
];

/**
 * Validates public HTTPS git repository URLs and rejects SSRF vectors,
 * file schemes, private IP ranges, and invalid hostnames (Threat T-04-03, T-07-09).
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

export function IngestModal({
  open,
  onOpenChange,
  onIngestComplete,
  onOpenAuth,
  initialRepositories,
}: IngestModalProps) {
  const { isAnonymous, getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'picker' | 'url'>('picker');
  const [repoUrl, setRepoUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setRepoUrl('');
      setValidationError(null);
      setIsIngesting(false);
      setCurrentStepIndex(0);
      setIngestError(null);
    }
  }, [open]);

  const handleOpenAuth = () => {
    if (onOpenAuth) {
      onOpenAuth();
    } else {
      setAuthModalOpen(true);
    }
  };

  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight start/poll when the modal closes or unmounts
  useEffect(() => {
    if (!open) abortRef.current?.abort();
    return () => abortRef.current?.abort();
  }, [open]);

  // Start a real ingestion job on the gateway and follow it to completion.
  const runPipeline = async (
    repoFullName: string,
    targetUrl: string,
    installationId?: number
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsIngesting(true);
    setIngestError(null);
    setCurrentStepIndex(0);

    try {
      const token = await getToken();
      const started = installationId
        ? await startPrivateIngest(repoFullName, installationId, token, controller.signal)
        : await startPublicIngest(targetUrl, token, controller.signal);

      const final = await waitForIngest(started.workspaceId, {
        getToken,
        signal: controller.signal,
        onProgress: (st) => setCurrentStepIndex(stepIndexForStatus(st.status)),
      });

      setCurrentStepIndex(INGEST_STEPS.length - 1);
      const newWorkspace: Workspace = {
        id: started.workspaceId,
        name: repoFullName,
        repoUrl: targetUrl,
        nodeCount: final.nodeCount,
      };
      setIsIngesting(false);
      onIngestComplete(newWorkspace);
      onOpenChange(false);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setIngestError((err as Error)?.message || 'Ingestion failed');
    }
  };

  // Trigger from RepoPicker selection
  const handleSelectPrivateRepo = (repo: GitHubRepositoryItem) => {
    runPipeline(repo.fullName, repo.htmlUrl, repo.installationId);
  };

  // Trigger from Public URL tab submission
  const handleStartPublicIngest = () => {
    const check = validateGitUrl(repoUrl);
    if (!check.valid) {
      setValidationError(check.error || 'Invalid repository URL');
      return;
    }

    setValidationError(null);
    try {
      const parsed = new URL(repoUrl.trim());
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const owner = pathParts[0];
      const name = pathParts[1].replace(/\.git$/, '');
      runPipeline(`${owner}/${name}`, repoUrl.trim());
    } catch {
      setValidationError('Malformed URL format');
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ingest Git Repository"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm font-mono animate-in fade-in duration-150"
        onClick={() => (!isIngesting || ingestError) && onOpenChange(false)}
      >
        <div
          className="w-full max-w-xl border border-border bg-card overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          data-testid="ingest-modal"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
            <div className="space-y-0.5 text-accent">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                <span className="text-xs font-bold tracking-widest uppercase">
                  ARGON // REPOSITORY INGESTION
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground font-normal">
                Select an authorized GitHub repository or supply a public git repository URL.
              </p>
            </div>
            {(!isIngesting || ingestError) && (
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
          <div className="p-6">
            {!isIngesting ? (
              <Tabs.Root
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as 'picker' | 'url')}
                className="space-y-4"
              >
                {/* Tab List */}
                <Tabs.List
                  aria-label="Ingestion sources"
                  className="flex border-b border-border bg-muted/30 p-1 gap-1"
                >
                  <Tabs.Trigger
                    value="picker"
                    data-testid="tab-your-repositories"
                    onClick={() => setActiveTab('picker')}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-all uppercase tracking-wider',
                      activeTab === 'picker'
                        ? 'border-b-2 border-accent text-accent bg-accent/10'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <FolderGit2 className="w-3.5 h-3.5" />
                    <span>Your Repositories</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="url"
                    data-testid="tab-public-git-url"
                    onClick={() => setActiveTab('url')}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-all uppercase tracking-wider',
                      activeTab === 'url'
                        ? 'border-b-2 border-accent text-accent bg-accent/10'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Public Git URL</span>
                  </Tabs.Trigger>
                </Tabs.List>

                {/* Tab 1: Your Repositories */}
                <Tabs.Content value="picker" className="pt-2 focus:outline-none">
                  <RepoPicker
                    onSelectRepo={handleSelectPrivateRepo}
                    isGuest={isAnonymous}
                    onOpenAuth={handleOpenAuth}
                    initialRepositories={initialRepositories}
                  />
                </Tabs.Content>

                {/* Tab 2: Public Git URL */}
                <Tabs.Content value="url" className="pt-2 space-y-4 focus:outline-none">
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
                      Public repository mode: Workspace graph is stored in your active FalkorDB instance and tied to your session.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border bg-card transition-colors"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      onClick={handleStartPublicIngest}
                      data-testid="submit-ingest-button"
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-background bg-accent hover:bg-accent/90 transition-colors uppercase tracking-wider"
                    >
                      <span>Start Ingestion</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            ) : (
              /* Active Ingestion Progress Display */
              <div className="space-y-5 py-2">
                <div className="flex items-center justify-between text-xs">
                  {ingestError ? (
                    <span className="text-danger font-bold uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span>INGESTION FAILED</span>
                    </span>
                  ) : (
                  <span className="text-accent font-bold uppercase tracking-wider flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>EXECUTING INGESTION PIPELINE...</span>
                  </span>
                  )}
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
                          ) : isCurrent && ingestError ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-danger" />
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

                {ingestError && (
                  <div className="space-y-3">
                    <div
                      role="alert"
                      data-testid="ingest-error"
                      className="p-3 border border-danger/60 bg-danger/10 text-xs text-danger flex items-start gap-2 break-words"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{ingestError}</span>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        data-testid="ingest-retry-button"
                        onClick={() => {
                          setIsIngesting(false);
                          setIngestError(null);
                          setCurrentStepIndex(0);
                        }}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-border hover:bg-foreground hover:text-background transition-colors"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Internal AuthModal in case onOpenAuth prop is omitted */}
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
}
