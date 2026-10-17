/**
 * Deriving a GitHub login + avatar from a Better Auth user. The GitHub provider stores the
 * handle in `user.name`; `user.image` is the GitHub avatar when present. Everything here is pure
 * so it can be unit-tested and reused by the header, the contributor picker and the user menu.
 */

export interface AuthUserLike {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  login?: string | null;
  isAnonymous?: boolean;
}

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/** The GitHub login/handle for display (`@handle`), or null when it can't be determined. */
export function githubLogin(user: AuthUserLike | null | undefined): string | null {
  if (!user || user.isAnonymous) return null;
  const candidates = [user.login, user.name, user.email?.split('@')[0]];
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v && GITHUB_LOGIN.test(v)) return v;
  }
  // fall back to a display name even if it isn't a valid handle (e.g. "Ayush Kumar")
  const name = (user.name ?? '').trim();
  return name || null;
}

/** Avatar URL for the user: their stored image, else GitHub's avatar for a valid login. */
export function userAvatarUrl(user: AuthUserLike | null | undefined, size = 80): string | null {
  if (!user || user.isAnonymous) return null;
  if (user.image) return user.image;
  const login = user.login ?? user.name ?? undefined;
  return login && GITHUB_LOGIN.test(login.trim())
    ? `https://avatars.githubusercontent.com/${login.trim()}?size=${size}`
    : null;
}

export const isGithubLogin = (value: string | null | undefined): boolean =>
  Boolean(value && GITHUB_LOGIN.test(value));
