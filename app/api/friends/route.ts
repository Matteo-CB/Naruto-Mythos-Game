import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'accepted' },
          { receiverId: userId, status: 'accepted' },
        ],
      },
      include: {
        sender: {
          select: {
            id: true, username: true, elo: true, role: true, badgePrefs: true,
            consecutiveWins: true, consecutiveLosses: true, tournamentWins: true,
          },
        },
        receiver: {
          select: {
            id: true, username: true, elo: true, role: true, badgePrefs: true,
            consecutiveWins: true, consecutiveLosses: true, tournamentWins: true,
          },
        },
      },
      take: 500,
    });

    const friendInfos = friendships.map((f) => {
      const other = f.senderId === userId ? f.receiver : f.sender;
      return { friendshipId: f.id, since: f.updatedAt, other };
    });
    const friendIds = friendInfos.map((f) => f.other.id);

    const myHistoryWithFriends = friendIds.length > 0
      ? await prisma.eloHistory.findMany({
          where: { userId, opponentId: { in: friendIds } },
          select: { opponentId: true, result: true, createdAt: true, delta: true },
          take: 500,
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const friendLastSeen = friendIds.length > 0
      ? await prisma.eloHistory.findMany({
          where: { userId: { in: friendIds } },
          select: { userId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          distinct: ['userId'],
          take: friendIds.length,
        })
      : [];

    const h2hByFriend = new Map<string, { wins: number; losses: number; netDelta: number; total: number }>();
    for (const row of myHistoryWithFriends) {
      const fid = row.opponentId;
      if (!fid) continue;
      const cur = h2hByFriend.get(fid) ?? { wins: 0, losses: 0, netDelta: 0, total: 0 };
      cur.total += 1;
      cur.netDelta += row.delta;
      if (row.result === 'win') cur.wins += 1;
      else if (row.result === 'loss') cur.losses += 1;
      h2hByFriend.set(fid, cur);
    }
    const lastSeenByFriend = new Map(friendLastSeen.map((r) => [r.userId, r.createdAt]));

    let rivalId: string | null = null;
    let rivalTotal = 0;
    for (const [fid, stats] of h2hByFriend.entries()) {
      if (stats.total > rivalTotal) {
        rivalTotal = stats.total;
        rivalId = fid;
      }
    }

    const friends = friendInfos.map((f) => {
      const h2h = h2hByFriend.get(f.other.id) ?? { wins: 0, losses: 0, netDelta: 0, total: 0 };
      const lastSeen = lastSeenByFriend.get(f.other.id) ?? null;
      return {
        id: f.other.id,
        username: f.other.username,
        elo: f.other.elo,
        role: f.other.role,
        badgePrefs: f.other.badgePrefs,
        consecutiveWins: f.other.consecutiveWins,
        consecutiveLosses: f.other.consecutiveLosses,
        tournamentWins: f.other.tournamentWins,
        friendshipId: f.friendshipId,
        since: f.since,
        h2h,
        lastSeenAt: lastSeen,
        isRival: f.other.id === rivalId && rivalTotal >= 3,
      };
    });

    friends.sort((a, b) => b.elo - a.elo);

    return NextResponse.json({ friends });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
