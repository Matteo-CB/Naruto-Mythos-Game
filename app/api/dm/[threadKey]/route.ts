import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { listMessages, sendDm, getDmLockReason, getUnreadDmCount } from '@/lib/dm/dmService';
import { threadKeyContains, otherUserIdFromThreadKey } from '@/lib/dm/dmRules';
import { emitToUser } from '@/lib/socket/io';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadKey: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { threadKey } = await params;
  if (!threadKey || !threadKeyContains(threadKey, userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const otherId = otherUserIdFromThreadKey(threadKey, userId);
  if (!otherId) {
    return NextResponse.json({ error: 'Invalid thread' }, { status: 400 });
  }

  const beforeParam = request.nextUrl.searchParams.get('before');
  const before = beforeParam ? new Date(Number(beforeParam) || beforeParam) : undefined;

  const [messages, lock, partner] = await Promise.all([
    listMessages(userId, threadKey, before && !isNaN(before.getTime()) ? before : undefined),
    getDmLockReason(userId, otherId),
    prisma.user.findUnique({ where: { id: otherId }, select: { id: true, username: true } }),
  ]);

  return NextResponse.json({
    messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.getTime() })),
    locked: lock.locked,
    friendshipId: lock.friendshipId,
    partner: partner ? { userId: partner.id, username: partner.username } : null,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadKey: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { threadKey } = await params;
  if (!threadKey || !threadKeyContains(threadKey, userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const otherId = otherUserIdFromThreadKey(threadKey, userId);
  if (!otherId) {
    return NextResponse.json({ error: 'Invalid thread' }, { status: 400 });
  }

  const body = await request.json();
  const result = await sendDm(userId, otherId, body?.body);
  if (!result.ok) {
    return NextResponse.json({ error: 'Not delivered', errorKey: result.errorKey }, { status: 403 });
  }

  const payload = {
    id: result.message.id,
    threadKey: result.message.threadKey,
    senderId: result.message.senderId,
    receiverId: result.message.receiverId,
    body: result.message.body,
    createdAt: result.message.createdAt.getTime(),
  };
  if (!result.echoOnly) {
    emitToUser(otherId, 'dm:message', payload);
    getUnreadDmCount(otherId)
      .then((total) => emitToUser(otherId, 'dm:unread-count', { total }))
      .catch(() => {});
  }
  return NextResponse.json({ message: payload }, { status: 201 });
}
