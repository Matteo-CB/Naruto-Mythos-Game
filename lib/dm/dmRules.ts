export type DmPermission =
  | { ok: true; echoOnly: boolean }
  | { ok: false; errorKey: 'dm.notFriends' | 'dm.disabled' | 'chat.muted' };

export function decideDmPermission(input: {
  areFriends: boolean;
  receiverAllowsNonFriends: boolean;
  blockedEither: boolean;
  muted: boolean;
  suspended: boolean;
  shadowMuted: boolean;
}): DmPermission {
  if (input.muted || input.suspended) return { ok: false, errorKey: 'chat.muted' };
  if (input.blockedEither) return { ok: false, errorKey: 'dm.disabled' };
  if (!input.areFriends && !input.receiverAllowsNonFriends) return { ok: false, errorKey: 'dm.notFriends' };
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

export interface ThreadSummaryInput {
  threadKey: string;
  senderId: string;
  receiverId: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface ThreadSummary<T extends ThreadSummaryInput> {
  threadKey: string;
  last: T;
  unread: number;
}

export function summarizeThreads<T extends ThreadSummaryInput>(messagesNewestFirst: T[], userId: string): ThreadSummary<T>[] {
  const byThread = new Map<string, ThreadSummary<T>>();
  for (const m of messagesNewestFirst) {
    const isUnreadForMe = m.receiverId === userId && !m.readAt;
    const entry = byThread.get(m.threadKey);
    if (!entry) {
      byThread.set(m.threadKey, { threadKey: m.threadKey, last: m, unread: isUnreadForMe ? 1 : 0 });
    } else if (isUnreadForMe) {
      entry.unread++;
    }
  }
  return [...byThread.values()];
}
