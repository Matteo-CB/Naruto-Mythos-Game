import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

interface ActivityEntry {
  type: 'win' | 'loss' | 'draw';
  friendId: string;
  friendUsername: string;
  opponentUsername: string;
  delta: number;
  newElo: number;
  oldElo: number;
  at: string;
}

const cache = new Map<string, { at: number; data: ActivityEntry[] }>();
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_USERS = 500;
const ACTIVITY_WINDOW_DAYS = 7;
const MAX_ENTRIES = 50;

function evictExpired(now: number) {
  for (const [k, v] of cache) {
    if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
  }
  if (cache.size > CACHE_MAX_USERS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const now = Date.now();
    evictExpired(now);
    const cached = cache.get(userId);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return NextResponse.json({ activity: cached.data, cached: true });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'accepted' },
          { receiverId: userId, status: 'accepted' },
        ],
      },
      select: { senderId: true, receiverId: true },
      take: 500,
    });

    const friendIds = friendships.map((f) => f.senderId === userId ? f.receiverId : f.senderId);

    if (friendIds.length === 0) {
      cache.set(userId, { at: now, data: [] });
      return NextResponse.json({ activity: [], cached: false });
    }

    const cutoff = new Date(now - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const friends = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, username: true },
    });
    const usernameById = new Map(friends.map((f) => [f.id, f.username]));

    const rows = await prisma.eloHistory.findMany({
      where: {
        userId: { in: friendIds },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ENTRIES,
      select: {
        userId: true,
        opponentUsername: true,
        result: true,
        delta: true,
        newElo: true,
        oldElo: true,
        createdAt: true,
      },
    });

    const activity: ActivityEntry[] = rows.map((r) => ({
      type: r.result as 'win' | 'loss' | 'draw',
      friendId: r.userId,
      friendUsername: usernameById.get(r.userId) ?? 'unknown',
      opponentUsername: r.opponentUsername ?? '?',
      delta: r.delta,
      newElo: r.newElo,
      oldElo: r.oldElo,
      at: r.createdAt.toISOString(),
    }));

    cache.set(userId, { at: now, data: activity });
    return NextResponse.json({ activity, cached: false });
  } catch (err) {
    console.error('[friends/activity] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ activity: [] });
  }
}
