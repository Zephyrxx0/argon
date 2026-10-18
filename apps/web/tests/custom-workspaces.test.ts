import { describe, it, expect, beforeEach } from 'vitest';
import {
  PENDING_GUEST_TTL_MS,
  adoptGuestWorkspaces,
  loadCustomWorkspaces,
  rememberGuestForLinking,
  saveCustomWorkspaces,
  storageKeyForOwner,
} from '@/lib/custom-workspaces';

const ws = (id: string) => ({ id, name: id });
const NOW = 1_800_000_000_000;

describe('remembered workspaces: guest -> account adoption', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps one list per owner, guests included (key shape is stable)', () => {
    expect(storageKeyForOwner('user-1')).toBe('argon.workspaces.custom.user-1');
    expect(storageKeyForOwner(null)).toBe('argon.workspaces.custom.guest');
    saveCustomWorkspaces('g1', [ws('pub-a-111111')]);
    saveCustomWorkspaces('g2', [ws('pub-b-222222')]);
    expect(loadCustomWorkspaces('g1').map((w) => w.id)).toEqual(['pub-a-111111']);
    expect(loadCustomWorkspaces('g2').map((w) => w.id)).toEqual(['pub-b-222222']);
  });

  it('ignores corrupt storage', () => {
    window.localStorage.setItem(storageKeyForOwner('u'), '{not json');
    expect(loadCustomWorkspaces('u')).toEqual([]);
    window.localStorage.setItem(storageKeyForOwner('u'), JSON.stringify([ws('ok'), { id: 5 }, null]));
    expect(loadCustomWorkspaces('u').map((w) => w.id)).toEqual(['ok']);
  });

  it('moves the linked guest\'s workspaces into the account\'s list and clears the guest\'s', () => {
    saveCustomWorkspaces('guest-1', [ws('pub-a-111111'), ws('pub-b-222222')]);
    saveCustomWorkspaces('user-1', [ws('pub-own-333333')]);
    rememberGuestForLinking('guest-1', NOW);

    const merged = adoptGuestWorkspaces('user-1', NOW + 1000)!;
    expect(merged.map((w) => w.id)).toEqual(['pub-own-333333', 'pub-a-111111', 'pub-b-222222']);
    expect(loadCustomWorkspaces('user-1').map((w) => w.id)).toEqual(merged.map((w) => w.id));
    expect(window.localStorage.getItem(storageKeyForOwner('guest-1'))).toBeNull();
  });

  it('is a one-shot: the marker is consumed, and duplicates are not added twice', () => {
    saveCustomWorkspaces('guest-1', [ws('pub-a-111111')]);
    saveCustomWorkspaces('user-1', [ws('pub-a-111111')]);
    rememberGuestForLinking('guest-1', NOW);
    expect(adoptGuestWorkspaces('user-1', NOW)!.map((w) => w.id)).toEqual(['pub-a-111111']);
    expect(adoptGuestWorkspaces('user-1', NOW)).toBeNull();
  });

  it('does not adopt other guests\' workspaces (only the linked session\'s list moves)', () => {
    saveCustomWorkspaces('guest-1', [ws('pub-a-111111')]);
    saveCustomWorkspaces('someone-else', [ws('pub-x-999999')]);
    rememberGuestForLinking('guest-1', NOW);
    adoptGuestWorkspaces('user-1', NOW);
    expect(loadCustomWorkspaces('user-1').map((w) => w.id)).toEqual(['pub-a-111111']);
    expect(loadCustomWorkspaces('someone-else').map((w) => w.id)).toEqual(['pub-x-999999']);
  });

  it('discards a stale marker, a marker naming the account itself, and a missing one', () => {
    saveCustomWorkspaces('guest-1', [ws('pub-a-111111')]);
    rememberGuestForLinking('guest-1', NOW);
    expect(adoptGuestWorkspaces('user-1', NOW + PENDING_GUEST_TTL_MS + 1)).toBeNull();
    expect(loadCustomWorkspaces('user-1')).toEqual([]);
    expect(loadCustomWorkspaces('guest-1')).toHaveLength(1); // not moved

    rememberGuestForLinking('user-1', NOW);
    expect(adoptGuestWorkspaces('user-1', NOW)).toBeNull();
    expect(adoptGuestWorkspaces('user-1', NOW)).toBeNull();
  });

  it('caps the merged list', () => {
    saveCustomWorkspaces('guest-1', Array.from({ length: 15 }, (_, i) => ws(`g${i}`)));
    saveCustomWorkspaces('user-1', Array.from({ length: 15 }, (_, i) => ws(`u${i}`)));
    rememberGuestForLinking('guest-1', NOW);
    expect(adoptGuestWorkspaces('user-1', NOW)!).toHaveLength(20);
  });
});
