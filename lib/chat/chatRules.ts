export type ChatVisibility = 'everyone' | 'friends' | 'off';

export type ChatLockState = 'open' | 'off' | 'friends_only' | 'blocked';

export interface ChatPairContext {
  aVisibility: ChatVisibility;
  bVisibility: ChatVisibility;
  areFriends: boolean;
  aBlockedB: boolean;
  bBlockedA: boolean;
}

export function normalizeChatVisibility(value: string | null | undefined): ChatVisibility {
  if (value === 'friends' || value === 'off') return value;
  return 'everyone';
}

export function canChatTogether(ctx: ChatPairContext): ChatLockState {
  if (ctx.aBlockedB || ctx.bBlockedA) return 'blocked';
  if (ctx.aVisibility === 'off' || ctx.bVisibility === 'off') return 'off';
  if ((ctx.aVisibility === 'friends' || ctx.bVisibility === 'friends') && !ctx.areFriends) {
    return 'friends_only';
  }
  return 'open';
}

export function publicLockState(state: ChatLockState): Exclude<ChatLockState, 'blocked'> {
  return state === 'blocked' ? 'off' : state;
}

export function isChatOpen(ctx: ChatPairContext): boolean {
  return canChatTogether(ctx) === 'open';
}
