/**
 * The ingested ("custom") workspaces a browser remembers, one list per account.
 *
 * Guests get their own list too (keyed by the guest session id): a guest's workspaces are only
 * accessible to that guest, so sharing one list between every guest session on a browser just
 * shows workspaces the current guest cannot open. When a guest signs in, the workspace access is
 * moved to the account on the server (see `migrateGuestAccess`), and the remembered list is moved
 * here with `adoptGuestWorkspaces`.
 */

const CUSTOM_WORKSPACES_KEY = 'argon.workspaces.custom';
const PENDING_GUEST_KEY = 'argon.workspaces.pendingGuest';
/** The sign-in round trip (GitHub and back) must finish within this time to adopt the guest list. */
export const PENDING_GUEST_TTL_MS = 10 * 60 * 1000;
const MAX_WORKSPACES = 20;

export interface StoredWorkspace {
  id: string;
  name: string;
}

export function storageKeyForOwner(ownerId: string | null | undefined): string {
  return `${CUSTOM_WORKSPACES_KEY}.${ownerId || 'guest'}`;
}

function isStoredWorkspace(w: unknown): w is StoredWorkspace {
  return typeof (w as StoredWorkspace)?.id === 'string' && typeof (w as StoredWorkspace)?.name === 'string';
}

export function loadCustomWorkspaces<T extends StoredWorkspace = StoredWorkspace>(
  ownerId: string | null | undefined
): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKeyForOwner(ownerId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed.filter(isStoredWorkspace) as T[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomWorkspaces(ownerId: string | null | undefined, list: StoredWorkspace[]): void {
  try {
    window.localStorage.setItem(storageKeyForOwner(ownerId), JSON.stringify(list));
  } catch {
    // storage unavailable: still usable for this session
  }
}

/** Call right before leaving for the sign-in provider, while the guest session still exists. */
export function rememberGuestForLinking(guestId: string | null | undefined, now = Date.now()): void {
  if (!guestId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_GUEST_KEY, JSON.stringify({ id: guestId, at: now }));
  } catch {
    // ignore
  }
}

/**
 * After signing in as `userId`, moves the remembered workspaces of the guest session that was
 * linked into the account's list. Returns the account's list when something was adopted,
 * otherwise null. A marker that is stale, or that names the account itself, is discarded.
 */
export function adoptGuestWorkspaces<T extends StoredWorkspace = StoredWorkspace>(
  userId: string,
  now = Date.now()
): T[] | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_GUEST_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_GUEST_KEY);
    const marker = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof marker?.id !== 'string' || typeof marker?.at !== 'number') return null;
    if (marker.id === userId || now - marker.at > PENDING_GUEST_TTL_MS) return null;

    const fromGuest = loadCustomWorkspaces<T>(marker.id);
    if (fromGuest.length === 0) return null;
    const own = loadCustomWorkspaces<T>(userId);
    const merged = [...own, ...fromGuest.filter((g) => !own.some((o) => o.id === g.id))].slice(0, MAX_WORKSPACES);
    saveCustomWorkspaces(userId, merged);
    window.localStorage.removeItem(storageKeyForOwner(marker.id));
    return merged;
  } catch {
    return null;
  }
}
