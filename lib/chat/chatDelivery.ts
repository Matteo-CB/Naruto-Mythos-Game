import { CHAT_MAX_LENGTH, CHAT_COOLDOWN_MS, CHAT_EMOTE_CODES } from './constants';
import type { ChatLockState } from './chatRules';

export function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
}

export type ChatValidation =
  | { ok: true; text: string }
  | { ok: false; errorKey: 'chat.emptyMessage' | 'chat.tooLong' | 'chat.invalidEmote' };

export function validateChatMessage(raw: unknown, isEmote: boolean): ChatValidation {
  const text = sanitizeChatText(raw);
  if (!text) return { ok: false, errorKey: 'chat.emptyMessage' };
  if (isEmote) {
    if (!CHAT_EMOTE_CODES.has(text)) return { ok: false, errorKey: 'chat.invalidEmote' };
    return { ok: true, text };
  }
  if (text.length > CHAT_MAX_LENGTH) return { ok: false, errorKey: 'chat.tooLong' };
  return { ok: true, text };
}

export function isOnChatCooldown(lastSentAt: number | undefined, now: number): boolean {
  return lastSentAt !== undefined && now - lastSentAt < CHAT_COOLDOWN_MS;
}

export type ChatDeliveryDecision =
  | { action: 'reject'; errorKey: 'chat.locked' | 'chat.muted' }
  | { action: 'echo_only' }
  | { action: 'deliver'; recipients: 'spectators_only' | 'players_and_spectators' };

export function decideChatDelivery(input: {
  isSpectator: boolean;
  muted: boolean;
  shadowMuted: boolean;
  playersLockState: ChatLockState;
}): ChatDeliveryDecision {
  if (input.muted) return { action: 'reject', errorKey: 'chat.muted' };
  if (input.shadowMuted) return { action: 'echo_only' };
  if (input.isSpectator) return { action: 'deliver', recipients: 'spectators_only' };
  if (input.playersLockState !== 'open') return { action: 'reject', errorKey: 'chat.locked' };
  return { action: 'deliver', recipients: 'players_and_spectators' };
}
