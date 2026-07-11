import { prisma } from '@/lib/db/prisma';
import { dmThreadKey, DM_MAX_LENGTH } from '@/lib/chat/constants';
import { sanitizeChatText } from '@/lib/chat/chatDelivery';
import { maskProfanity } from '@/lib/chat/wordFilter';
import { getModerationFlags } from '@/lib/moderation/sanctions';
import { decideDmPermission, otherUserIdFromThreadKey, type DmPermission } from './dmRules';

export interface DmMessageView {
  id: string;
  threadKey: string;
  senderId: string;
  receiverId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface DmThreadView {
  threadKey: string;
  partner: { userId: string; username: string };
  lastMessage: { body: string; senderId: string; createdAt: Date } | null;
  unreadCount: number;
}

export type DmLockReason = 'not_friends' | 'disabled' | null;

export async function getDmPermission(senderId: string, receiverId: string): Promise<DmPermission> {
  const [friendship, blocks, flags] = await Promise.all([
    prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
      select: { id: true },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
      select: { id: true },
    }),
    getModerationFlags(senderId),
  ]);
  return decideDmPermission({
    areFriends: friendship !== null,
    blockedEither: blocks !== null,
    muted: flags.muted,
    suspended: flags.suspended,
    shadowMuted: flags.shadowMuted,
  });
}

export async function getDmLockReason(userIdA: string, userIdB: string): Promise<{ locked: DmLockReason; friendshipId: string | null }> {
  const [friendship, blocks] = await Promise.all([
    prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userIdA, receiverId: userIdB },
          { senderId: userIdB, receiverId: userIdA },
        ],
      },
      select: { id: true },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userIdA, blockedId: userIdB },
          { blockerId: userIdB, blockedId: userIdA },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (blocks) return { locked: 'disabled', friendshipId: null };
  if (!friendship) return { locked: 'not_friends', friendshipId: null };
  return { locked: null, friendshipId: friendship.id };
}

export type SendDmResult =
  | { ok: true; message: DmMessageView; echoOnly: boolean }
  | { ok: false; errorKey: string };

export async function sendDm(senderId: string, receiverId: string, rawBody: unknown): Promise<SendDmResult> {
  const body = sanitizeChatText(rawBody);
  if (!body) return { ok: false, errorKey: 'chat.emptyMessage' };
  if (body.length > DM_MAX_LENGTH) return { ok: false, errorKey: 'chat.tooLong' };
  if (senderId === receiverId) return { ok: false, errorKey: 'dm.notFriends' };

  const permission = await getDmPermission(senderId, receiverId);
  if (!permission.ok) return { ok: false, errorKey: permission.errorKey };

  const threadKey = dmThreadKey(senderId, receiverId);

  if (permission.echoOnly) {
    return {
      ok: true,
      echoOnly: true,
      message: {
        id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        threadKey, senderId, receiverId,
        body: maskProfanity(body),
        readAt: null,
        createdAt: new Date(),
      },
    };
  }

  const created = await prisma.privateMessage.create({
    data: { threadKey, senderId, receiverId, body },
  });
  return {
    ok: true,
    echoOnly: false,
    message: { ...created, body: maskProfanity(created.body) },
  };
}

export async function getUnreadDmCount(userId: string): Promise<number> {
  return prisma.privateMessage.count({
    where: { receiverId: userId, readAt: null },
  });
}

export async function markThreadRead(userId: string, threadKey: string): Promise<number> {
  const other = otherUserIdFromThreadKey(threadKey, userId);
  if (!other) return 0;
  const result = await prisma.privateMessage.updateMany({
    where: { threadKey, receiverId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function listThreads(userId: string): Promise<DmThreadView[]> {
  const messages = await prisma.privateMessage.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });

  const byThread = new Map<string, { last: typeof messages[number]; unread: number }>();
  for (const m of messages) {
    const entry = byThread.get(m.threadKey);
    if (!entry) {
      byThread.set(m.threadKey, { last: m, unread: m.receiverId === userId && !m.readAt ? 1 : 0 });
    } else if (m.receiverId === userId && !m.readAt) {
      entry.unread++;
    }
  }

  const partnerIds = [...byThread.keys()]
    .map((k) => otherUserIdFromThreadKey(k, userId))
    .filter((v): v is string => v !== null);
  const partners = await prisma.user.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, username: true },
  });
  const nameById = new Map(partners.map((p) => [p.id, p.username]));

  return [...byThread.entries()].map(([threadKey, { last, unread }]) => {
    const partnerId = otherUserIdFromThreadKey(threadKey, userId) ?? '';
    return {
      threadKey,
      partner: { userId: partnerId, username: nameById.get(partnerId) ?? '???' },
      lastMessage: { body: maskProfanity(last.body), senderId: last.senderId, createdAt: last.createdAt },
      unreadCount: unread,
    };
  });
}

export async function listMessages(userId: string, threadKey: string, before?: Date): Promise<DmMessageView[]> {
  const other = otherUserIdFromThreadKey(threadKey, userId);
  if (!other) return [];
  const messages = await prisma.privateMessage.findMany({
    where: { threadKey, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return messages.reverse().map((m) => ({ ...m, body: maskProfanity(m.body) }));
}
