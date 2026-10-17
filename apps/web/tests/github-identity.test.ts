import { describe, it, expect } from 'vitest';
import { githubLogin, userAvatarUrl, isGithubLogin } from '@/lib/github-identity';

describe('github identity helpers', () => {
  it('derives a login, preferring an explicit login, then name, then email local-part', () => {
    expect(githubLogin({ login: 'octocat', name: 'The Octocat' })).toBe('octocat');
    expect(githubLogin({ name: 'Zephyrxx0' })).toBe('Zephyrxx0');
    expect(githubLogin({ email: 'ayush@example.com' })).toBe('ayush');
    // a display name with a space is not a valid handle but is still shown as a fallback
    expect(githubLogin({ name: 'Ayush Kumar' })).toBe('Ayush Kumar');
  });

  it('returns null for guests / missing users', () => {
    expect(githubLogin(null)).toBeNull();
    expect(githubLogin({ isAnonymous: true, name: 'Guest' })).toBeNull();
    expect(githubLogin({})).toBeNull();
  });

  it('uses the stored image, else a GitHub avatar for a valid login', () => {
    expect(userAvatarUrl({ image: 'https://x/y.png', name: 'octocat' })).toBe('https://x/y.png');
    expect(userAvatarUrl({ name: 'octocat' }, 64)).toBe('https://avatars.githubusercontent.com/octocat?size=64');
    // name is not a handle and there is no image: no guessed URL (so <img> never 404s)
    expect(userAvatarUrl({ name: 'Ayush Kumar' })).toBeNull();
    expect(userAvatarUrl({ isAnonymous: true, image: 'x' })).toBeNull();
  });

  it('validates GitHub login shape', () => {
    expect(isGithubLogin('Zephyrxx0')).toBe(true);
    expect(isGithubLogin('a-b-c')).toBe(true);
    expect(isGithubLogin('Ayush Kumar')).toBe(false);
    expect(isGithubLogin('-bad')).toBe(false);
    expect(isGithubLogin('')).toBe(false);
    expect(isGithubLogin(null)).toBe(false);
  });
});
