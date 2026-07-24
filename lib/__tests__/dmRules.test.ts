import { describe, it, expect } from 'vitest';
import { decideDmPermission, threadKeyContains, otherUserIdFromThreadKey, summarizeThreads } from '@/lib/dm/dmRules';
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
  const base = { areFriends: true, receiverAllowsNonFriends: false, blockedEither: false, muted: false, suspended: false, shadowMuted: false };

  it('friends can DM', () => {
    expect(decideDmPermission(base)).toEqual({ ok: true, echoOnly: false });
  });

  it('non-friends cannot DM when the receiver disallows non-friend messages', () => {
    expect(decideDmPermission({ ...base, areFriends: false })).toEqual({ ok: false, errorKey: 'dm.notFriends' });
  });

  it('non-friends CAN DM when the receiver allows non-friend messages', () => {
    expect(decideDmPermission({ ...base, areFriends: false, receiverAllowsNonFriends: true })).toEqual({ ok: true, echoOnly: false });
  });

  it('a block in either direction locks the DM even between friends', () => {
    expect(decideDmPermission({ ...base, blockedEither: true })).toEqual({ ok: false, errorKey: 'dm.disabled' });
  });

  it('a block locks the DM even when the receiver allows non-friends', () => {
    expect(decideDmPermission({ ...base, areFriends: false, receiverAllowsNonFriends: true, blockedEither: true })).toEqual({ ok: false, errorKey: 'dm.disabled' });
  });

  it('muted or suspended senders cannot DM', () => {
    expect(decideDmPermission({ ...base, muted: true })).toEqual({ ok: false, errorKey: 'chat.muted' });
    expect(decideDmPermission({ ...base, suspended: true })).toEqual({ ok: false, errorKey: 'chat.muted' });
  });

  it('shadow-muted senders get echo-only delivery', () => {
    expect(decideDmPermission({ ...base, shadowMuted: true })).toEqual({ ok: true, echoOnly: true });
  });

  it('mute wins over block and friendship checks', () => {
    expect(decideDmPermission({ areFriends: false, receiverAllowsNonFriends: false, blockedEither: true, muted: true, suspended: false, shadowMuted: false }))
      .toEqual({ ok: false, errorKey: 'chat.muted' });
  });
});

describe('summarizeThreads (unread counter)', () => {
  function msg(threadKey: string, senderId: string, receiverId: string, read: boolean, ageMs: number) {
    return { threadKey, senderId, receiverId, readAt: read ? new Date(1000) : null, createdAt: new Date(100000 - ageMs) };
  }

  it('counts only unread messages addressed to me, keeps the newest as last', () => {
    const me = 'me';
    const messages = [
      msg('a:me', 'a', me, false, 0),
      msg('a:me', 'a', me, false, 10),
      msg('a:me', me, 'a', false, 20),
      msg('a:me', 'a', me, true, 30),
      msg('b:me', me, 'b', false, 5),
    ];
    const out = summarizeThreads(messages, me);
    const threadA = out.find((t) => t.threadKey === 'a:me')!;
    const threadB = out.find((t) => t.threadKey === 'b:me')!;
    expect(threadA.unread).toBe(2);
    expect(threadA.last).toBe(messages[0]);
    expect(threadB.unread).toBe(0);
    expect(threadB.last).toBe(messages[4]);
  });

  it('my own sent messages never count as unread', () => {
    const out = summarizeThreads([msg('a:me', 'me', 'a', false, 0)], 'me');
    expect(out[0].unread).toBe(0);
  });
});
