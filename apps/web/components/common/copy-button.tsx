'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { clsx } from 'clsx';

export interface CopyButtonProps {
  /** The text placed on the clipboard. */
  value: string;
  /** Accessible label; defaults to "Copy". */
  label?: string;
  className?: string;
}

/**
 * Copy-to-clipboard button with a transient "copied" confirmation. Falls back to a hidden
 * textarea + execCommand when the async Clipboard API is unavailable (http / older browsers),
 * and surfaces failure as the label "Copy failed" rather than throwing.
 */
export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flash = useCallback((next: 'copied' | 'error') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }, []);

  const copy = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('execCommand copy failed');
      }
      flash('copied');
    } catch {
      flash('error');
    }
  }, [value, flash]);

  return (
    <button
      type="button"
      onClick={copy}
      data-testid="copy-button"
      data-state={state}
      aria-label={state === 'copied' ? 'Copied' : label}
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer',
        state === 'copied'
          ? 'border-success/50 text-success bg-success/10'
          : state === 'error'
            ? 'border-danger/50 text-danger bg-danger/10'
            : 'border-border text-muted-foreground hover:border-accent hover:text-accent',
        className
      )}
    >
      {state === 'copied' ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      <span>{state === 'copied' ? 'Copied' : state === 'error' ? 'Copy failed' : label}</span>
    </button>
  );
}

export interface CodeBlockProps {
  code: string;
  /** Optional caption shown above the block (e.g. a file path). */
  caption?: string;
  className?: string;
}

/** A monospace code block with a copy button, matching the brutalist panel styling. */
export function CodeBlock({ code, caption, className }: CodeBlockProps) {
  return (
    <div className={clsx('border border-border bg-background', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {caption ?? 'config'}
        </span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
