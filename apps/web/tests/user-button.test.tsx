import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserButton } from '@/components/auth/user-button';
import * as providers from '@/app/providers';

const mountMenu = () => {
  render(<UserButton onOpenAuthModal={vi.fn()} />);
  fireEvent.click(screen.getByTestId('user-button-trigger'));
};

describe('UserButton', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the GitHub handle (not the spaced display name) and no stats row', () => {
    vi.spyOn(providers, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'octocat', email: 'octocat@github.com', image: null, isAnonymous: false },
      isAnonymous: false,
      signOut: vi.fn(),
    } as any);

    mountMenu();
    expect(screen.getAllByText('@octocat').length).toBeGreaterThan(0);
    // #1 stats row removed
    expect(screen.queryByText('GITHUB VERIFIED')).toBeNull();
    expect(screen.queryByText(/WORKSPACE$/)).toBeNull();
  });

  it('derives a GitHub avatar URL when the user has no stored image', async () => {
    // Radix Avatar.Image only mounts after the browser loads the image (never in jsdom), so we
    // assert the URL the component passes to it rather than a rendered <img>.
    const { userAvatarUrl } = await import('@/lib/github-identity');
    expect(userAvatarUrl({ id: 'u1', name: 'octocat', image: null, isAnonymous: false })).toBe(
      'https://avatars.githubusercontent.com/octocat?size=80'
    );
    expect(userAvatarUrl({ id: 'u1', name: 'octocat', image: 'https://cdn/x.png', isAnonymous: false })).toBe(
      'https://cdn/x.png'
    );
  });
});
