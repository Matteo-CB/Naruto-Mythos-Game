export type DmPermission =
  | { ok: true; echoOnly: boolean }
  | { ok: false; errorKey: 'dm.notFriends' | 'dm.disabled' | 'chat.muted' };

export function decideDmPermission(input: {
  areFriends: boolean;
  blockedEither: boolean;
  muted: boolean;
  suspended: boolean;
  shadowMuted: boolean;
}): DmPermission {
  if (input.muted || input.suspended) return { ok: false, errorKey: 'chat.muted' };
  if (input.blockedEither) return { ok: false, errorKey: 'dm.disabled' };
  if (!input.areFriends) return { ok: false, errorKey: 'dm.notFriends' };
  return { ok: true, echoOnly: input.shadowMuted };
}

export function threadKeyContains(threadKey: string, userId: string): boolean {
  const [a, b] = threadKey.split(':');
  return a === userId || b === userId;
}

export function otherUserIdFromThreadKey(threadKey: string, userId: string): string | null {
  const [a, b] = threadKey.split(':');
  if (!a || !b) return null;
  if (a === userId) return b;
  if (b === userId) return a;
  return null;
}
