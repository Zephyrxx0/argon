'use client';

import React, { useState } from 'react';
import { Layers, GitFork, Users, ShieldAlert, History } from 'lucide-react';
import { clsx } from 'clsx';

export interface SectionCitationCounts {
  summary?: number;
  blastRadius?: number;
  keyOwners?: number;
  decisions?: number;
  precedents?: number;
}

export interface StickyJumpBarProps {
  counts?: SectionCitationCounts;
  className?: string;
}

const SECTIONS = [
  { id: 'sec-summary', label: 'SUMMARY', icon: Layers, countKey: 'summary' as const },
  { id: 'sec-blast-radius', label: 'BLAST RADIUS', icon: GitFork, countKey: 'blastRadius' as const },
  { id: 'sec-key-owners', label: 'KEY OWNERS', icon: Users, countKey: 'keyOwners' as const },
  { id: 'sec-decisions', label: 'DECISIONS', icon: ShieldAlert, countKey: 'decisions' as const },
  { id: 'sec-precedents', label: 'PRECEDENTS', icon: History, countKey: 'precedents' as const },
];

export function StickyJumpBar({ counts = {}, className }: StickyJumpBarProps) {
  const [activeSection, setActiveSection] = useState<string>('sec-summary');

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className={clsx(
        'sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md px-3 py-2 font-mono flex items-center gap-1.5 overflow-x-auto no-scrollbar select-none',
        className
      )}
      data-testid="sticky-jump-bar"
    >
      {SECTIONS.map((sec) => {
        const Icon = sec.icon;
        const isActive = activeSection === sec.id;
        const count = counts[sec.countKey] ?? 0;

        return (
          <button
            key={sec.id}
            type="button"
            onClick={() => scrollToSection(sec.id)}
            data-testid={`jump-pill-${sec.id}`}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors shrink-0',
              isActive
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            <Icon className="w-3 h-3" />
            <span>[{sec.label}]</span>
            {count > 0 && (
              <span
                className={clsx(
                  'px-1 py-0.2 text-[9px] font-mono border',
                  isActive
                    ? 'border-accent/50 bg-accent text-background'
                    : 'border-border bg-background text-muted-foreground'
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

