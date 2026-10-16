'use client';

import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Avatar from '@radix-ui/react-avatar';
import { ChevronDown, LogOut, RefreshCw, User as UserIcon, Shield } from 'lucide-react';
import { useAuth } from '@/app/providers';

export interface UserButtonProps {
  onOpenAuthModal?: () => void;
  className?: string;
}

export function UserButton({ onOpenAuthModal, className }: UserButtonProps) {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const loginHandle = user.name || user.email?.split('@')[0] || 'user';
  const initials = loginHandle.slice(0, 2).toUpperCase();
  const avatarUrl = user.image;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="user-button-trigger"
        className={`flex items-center gap-1.5 px-2 py-1 border border-border bg-card hover:border-accent/60 transition-colors font-mono text-xs outline-none cursor-pointer ${className || ''}`}
        aria-label="User profile menu"
      >
        <Avatar.Root className="w-5 h-5 rounded-sm overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border/80">
          {avatarUrl ? (
            <Avatar.Image
              src={avatarUrl}
              alt={loginHandle}
              className="w-full h-full object-cover"
            />
          ) : null}
          <Avatar.Fallback className="text-[10px] font-bold text-accent">
            {initials}
          </Avatar.Fallback>
        </Avatar.Root>

        <span className="max-w-[120px] sm:max-w-[160px] truncate text-foreground text-xs">
          @{loginHandle}
        </span>

        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-testid="user-menu-content"
          align="end"
          sideOffset={6}
          className="w-64 border border-border bg-card shadow-[0_0_30px_rgba(0,0,0,0.85)] font-mono p-1 text-xs outline-none z-50 animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {/* User Profile Header */}
          <div className="p-3 bg-muted/40 border border-border/40 mb-1 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-sm overflow-hidden bg-background border border-border flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={loginHandle} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-4 h-4 text-accent" />
                )}
              </div>
              <div className="overflow-hidden">
                <div className="font-bold text-foreground truncate">@{loginHandle}</div>
                {user.email && (
                  <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
              <span className="flex items-center gap-1 text-accent">
                <Shield className="w-3 h-3" />
                <span>GITHUB VERIFIED</span>
              </span>
              <span className="px-1.5 py-0.5 border border-border bg-background text-foreground uppercase tracking-wider font-bold">
                1 WORKSPACE
              </span>
            </div>
          </div>

          <DropdownMenu.Separator className="h-[1px] bg-border my-1" />

          {/* Switch Account */}
          <DropdownMenu.Item
            data-testid="user-menu-switch-account"
            onSelect={() => {
              if (onOpenAuthModal) onOpenAuthModal();
            }}
            className="flex items-center gap-2 px-2.5 py-2 text-xs text-foreground hover:bg-accent/10 hover:text-accent cursor-pointer outline-none transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Switch Account</span>
          </DropdownMenu.Item>

          {/* Sign Out */}
          <DropdownMenu.Item
            data-testid="user-menu-sign-out"
            disabled={isSigningOut}
            onSelect={handleSignOut}
            className="flex items-center gap-2 px-2.5 py-2 text-xs text-destructive hover:bg-destructive/10 cursor-pointer outline-none transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
