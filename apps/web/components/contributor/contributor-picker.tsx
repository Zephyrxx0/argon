'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User, UserCheck, ChevronDown, Search, X, Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface Contributor {
  id: string;
  name: string;
  role: string;
  commits: number;
  lastActive: string;
}

export const SAMPLE_CONTRIBUTORS: Contributor[] = [
  { id: 'sarah-connor', name: 'Sarah Connor', role: 'Top Contributor', commits: 342, lastActive: '2d ago' },
  { id: 'alex-chen', name: 'Alex Chen', role: 'Core Architect', commits: 218, lastActive: '5d ago' },
  { id: 'marcus-wright', name: 'Marcus Wright', role: 'Component Lead', commits: 154, lastActive: '1w ago' },
  { id: 'elena-rostova', name: 'Elena Rostova', role: 'Security Reviewer', commits: 88, lastActive: '3w ago' },
];

export interface ContributorPickerProps {
  contributors?: Contributor[];
  currentContributorId?: string | null;
  onSelectContributor: (contributorId: string | null) => void;
  className?: string;
}

export function ContributorPicker({
  contributors = SAMPLE_CONTRIBUTORS,
  currentContributorId = null,
  onSelectContributor,
  className,
}: ContributorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeContributor = contributors.find((c) => c.id === currentContributorId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = contributors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string | null) => {
    onSelectContributor(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={dropdownRef} className={clsx('relative font-mono', className)}>
      {/* Contributor Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="contributor-picker-trigger"
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 border text-xs transition-colors select-none',
          activeContributor
            ? 'border-purple-500/50 bg-purple-500/10 text-purple-300 hover:border-purple-400'
            : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground'
        )}
      >
        {activeContributor ? (
          <UserCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        ) : (
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium truncate max-w-[100px] sm:max-w-[140px]">
          {activeContributor ? activeContributor.name : 'Guest'}
        </span>
        {activeContributor && (
          <span className="hidden md:inline-block text-[10px] text-purple-400/80 bg-purple-900/30 px-1 border border-purple-500/30">
            {activeContributor.role.split(' ')[0]}
          </span>
        )}
        <ChevronDown
          className={clsx(
            'w-3 h-3 text-muted-foreground transition-transform ml-0.5',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Searchable Combobox Dropdown */}
      {isOpen && (
        <div
          data-testid="contributor-dropdown"
          className="absolute right-0 mt-1 w-72 border border-border bg-card shadow-2xl z-40 overflow-hidden animate-in fade-in duration-100"
        >
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="flex items-center px-2 py-1 bg-background border border-border">
              <Search className="w-3 h-3 text-muted-foreground mr-1.5 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search author by name or role..."
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono"
                autoFocus
                data-testid="contributor-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border flex items-center justify-between">
            <span>WHO AM I? (PERSONALIZED BRIEFING)</span>
            <span>COMMITS</span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No matching contributors found.
              </div>
            ) : (
              filtered.map((contributor) => {
                const isSelected = contributor.id === activeContributor?.id;
                return (
                  <button
                    key={contributor.id}
                    type="button"
                    onClick={() => handleSelect(contributor.id)}
                    data-testid={`contributor-item-${contributor.id}`}
                    className={clsx(
                      'w-full flex items-center justify-between p-2.5 text-left text-xs transition-colors',
                      isSelected
                        ? 'bg-purple-950/40 text-purple-200 border-l-2 border-purple-500'
                        : 'text-foreground hover:bg-muted/60 hover:text-purple-300'
                    )}
                  >
                    <div className="space-y-0.5 truncate pr-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        {isSelected && <Check className="w-3 h-3 text-purple-400 shrink-0" />}
                        <span>{contributor.name}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span className="text-purple-400">{contributor.role}</span>
                        <span>•</span>
                        <span>Active {contributor.lastActive}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {contributor.commits} commits
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Reset / Guest Mode Trigger */}
          <div className="p-2 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              data-testid="clear-contributor-button"
              className="w-full flex items-center justify-center gap-1.5 py-1 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border bg-card transition-colors uppercase"
            >
              <span>RESET TO GUEST (UNASSIGNED)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
