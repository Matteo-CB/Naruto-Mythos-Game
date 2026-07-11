import { describe, it, expect } from 'vitest';
import { decideDmPermission, threadKeyContains, otherUserIdFromThreadKey } from '@/lib/dm/dmRules';
import { dmThreadKey } from '@/lib/chat/constants';

describe('dmThreadKey', () => {
  it('is stable regardless of argument order', () => {
    expect(dmThreadKey('aaa', 'bbb')).toBe('aaa:bbb');
    expect(dmThreadKey('bbb', 'aaa')).toBe('aaa:bbb');
  });

  it('threadKeyContains and otherUserIdFromThreadKey resolve members', () => {
    const key = dmThreadKey('user1', 'user2');
    expect(threadKeyContains(key, 'user1')).toBe(true);
    expect(threadKeyContains(key, 'user2')).toBe(true);
    expect(threadKeyContains(key, 'user3')).toBe(false);
    expect(otherUserIdFromThreadKey(key, 'user1')).toBe('user2');
    expect(otherUserIdFromThreadKey(key, 'user2')).toBe('user1');
    expect(otherUserIdFromThreadKey(key, 'user3')).toBe(null);
    expect(otherUserIdFromThreadKey('malformed', 'user1')).toBe(null);
  });
});

describe('decideDmPermission', () => {
  const base = { areFriends: true, blockedEither: false, muted: false, suspended: false, shadowMuted: false };

  it('friends can DM', () => {
    expect(decideDmPermission(base)).toEqual({ ok: true, echoOnly: false });
  });

  it('non-friends cannot DM', () => {
    expect(decideDmPermission({ ...base, areFriends: false })).toEqual({ ok: false, errorKey: 'dm.notFriends' });
  });

  it('a block in either direction locks the DM even between friends', () => {
    expect(decideDmPermission({ ...base, blockedEither: true })).toEqual({ ok: false, errorKey: 'dm.disabled' });
  });

  it('muted or suspended senders cannot DM', () => {
    expect(decideDmPermission({ ...base, muted: true })).toEqual({ ok: false, errorKey: 'chat.muted' });
    expect(decideDmPermission({ ...base, suspended: true })).toEqual({ ok: false, errorKey: 'chat.muted' });
  });

  it('shadow-muted senders get echo-only delivery', () => {
    expect(decideDmPermission({ ...base, shadowMuted: true })).toEqual({ ok: true, echoOnly: true });
  });

  it('mute wins over block and friendship checks', () => {
    expect(decideDmPermission({ areFriends: false, blockedEither: true, muted: true, suspended: false, shadowMuted: false }))
      .toEqual({ ok: false, errorKey: 'chat.muted' });
  });
});
