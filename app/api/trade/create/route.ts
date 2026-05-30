import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { areFriends, userCanTrade } from '@/lib/trade/validation';
import { emitToUser } from '@/lib/socket/io';
import { withUserLock } from '@/lib/quests/userLock';

const createRate = new Map<string, number[]>();
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY = 10;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { friendId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'trade.error.invalidBody' }, { status: 400 });
  }
  const friendId = typeof body.friendId === 'string' ? body.friendId : '';
  if (!friendId || friendId === userId) {
    return NextResponse.json({ error: 'Invalid friend', errorKey: 'trade.error.invalidBody' }, { status: 400 });
  }

  const now = Date.now();
  const recent = (createRate.get(userId) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= MAX_PER_DAY) {
    return NextResponse.json({ error: 'Too many trade rooms today', errorKey: 'trade.error.rateLimit' }, { status: 429 });
  }

  if (!(await areFriends(userId, friendId))) {
    return NextResponse.json({ error: 'Not friends', errorKey: 'trade.error.notFriend' }, { status: 403 });
  }
  if (!(await userCanTrade(userId)) || !(await userCanTrade(friendId))) {
    return NextResponse.json({ error: 'Tier too low', errorKey: 'trade.error.tierTooLow' }, { status: 403 });
  }

  const pairKey = `trade-create:${[userId, friendId].sort().join(':')}`;
  const { roomId, reused } = await withUserLock(pairKey, async () => {
    const existing = await prisma.tradeRoom.findFirst({
      where: {
        status: { in: ['pending', 'active'] },
        OR: [
          { creatorId: userId, guestId: friendId },
          { creatorId: friendId, guestId: userId },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      return { roomId: existing.id, reused: true };
    }
    const room = await prisma.tradeRoom.create({
      data: { creatorId: userId, guestId: friendId, status: 'pending' },
      select: { id: true },
    });
    return { roomId: room.id, reused: false };
  });

  if (reused) {
    return NextResponse.json({ roomId, reused: true });
  }

  recent.push(now);
  createRate.set(userId, recent);

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  emitToUser(friendId, 'trade:invited', { roomId, fromUsername: me?.username ?? '' });

  return NextResponse.json({ roomId, reused: false });
}
