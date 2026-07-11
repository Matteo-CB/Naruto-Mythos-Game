import { describe, it, expect } from 'vitest';
import { canChatTogether, publicLockState, normalizeChatVisibility, type ChatPairContext } from '@/lib/chat/chatRules';

function ctx(overrides: Partial<ChatPairContext> = {}): ChatPairContext {
  return {
    aVisibility: 'everyone',
    bVisibility: 'everyone',
    areFriends: false,
    aBlockedB: false,
    bBlockedA: false,
    ...overrides,
  };
}

describe('canChatTogether', () => {
  it('is open when both allow everyone', () => {
    expect(canChatTogether(ctx())).toBe('open');
  });

  it('block wins over everything, in both directions', () => {
    expect(canChatTogether(ctx({ aBlockedB: true }))).toBe('blocked');
    expect(canChatTogether(ctx({ bBlockedA: true }))).toBe('blocked');
    expect(canChatTogether(ctx({ aBlockedB: true, areFriends: true }))).toBe('blocked');
    expect(canChatTogether(ctx({ bBlockedA: true, aVisibility: 'friends', areFriends: true }))).toBe('blocked');
  });

  it('off wins over friendship, from either side', () => {
    expect(canChatTogether(ctx({ aVisibility: 'off', areFriends: true }))).toBe('off');
    expect(canChatTogether(ctx({ bVisibility: 'off', areFriends: true }))).toBe('off');
  });

  it('friends-only locks non-friends and opens for friends', () => {
    expect(canChatTogether(ctx({ aVisibility: 'friends' }))).toBe('friends_only');
    expect(canChatTogether(ctx({ bVisibility: 'friends' }))).toBe('friends_only');
    expect(canChatTogether(ctx({ aVisibility: 'friends', areFriends: true }))).toBe('open');
    expect(canChatTogether(ctx({ aVisibility: 'friends', bVisibility: 'friends', areFriends: true }))).toBe('open');
  });

  it('becoming friends mid-game unlocks a friends_only chat but never an off chat', () => {
    const before = ctx({ bVisibility: 'friends' });
    expect(canChatTogether(before)).toBe('friends_only');
    expect(canChatTogether({ ...before, areFriends: true })).toBe('open');
    const offCtx = ctx({ bVisibility: 'off' });
    expect(canChatTogether({ ...offCtx, areFriends: true })).toBe('off');
  });
});

describe('publicLockState', () => {
  it('hides blocked as off so the blocked player is never told', () => {
    expect(publicLockState('blocked')).toBe('off');
    expect(publicLockState('open')).toBe('open');
    expect(publicLockState('friends_only')).toBe('friends_only');
    expect(publicLockState('off')).toBe('off');
  });
});

describe('normalizeChatVisibility', () => {
  it('defaults unknown values to everyone', () => {
    expect(normalizeChatVisibility('friends')).toBe('friends');
    expect(normalizeChatVisibility('off')).toBe('off');
    expect(normalizeChatVisibility('everyone')).toBe('everyone');
    expect(normalizeChatVisibility(null)).toBe('everyone');
    expect(normalizeChatVisibility(undefined)).toBe('everyone');
    expect(normalizeChatVisibility('weird')).toBe('everyone');
  });
});
