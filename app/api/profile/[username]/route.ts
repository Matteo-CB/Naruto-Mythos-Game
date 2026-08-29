import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { isAdmin } from '@/lib/auth/admins';
import { cleanupOldGames } from '@/lib/db/gameCleanup';
import { deckUsesOnlyAllowedSets } from '@/lib/evolving/computePoints';
import { getFollowState } from '@/lib/social/followSync';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';

let lastCleanup = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const rawPage = parseInt(searchParams.get('page') ?? '1', 10);
    const page = Math.min(50, Math.max(1, isNaN(rawPage) ? 1 : rawPage));
    const perPage = 5;

    const now = Date.now();
    if (now - lastCleanup > 5 * 60 * 1000) {
      lastCleanup = now;
      cleanupOldGames().catch(() => {});
    }

    const normalized = username.replace(/\+/g, ' ');

    const user = await prisma.user.findFirst({
      where: { username: { equals: normalized, mode: 'insensitive' } },
      select: {
        id: true,
        username: true,
        email: true,
        countryCode: true,
        selectedSeasonBadge: true,
        elo: true,
        evolvingElo: true,
        wins: true,
        losses: true,
        draws: true,
        evolvingWins: true,
        evolvingLosses: true,
        evolvingDraws: true,
        highlanderElo: true,
        highlanderWins: true,
        highlanderLosses: true,
        highlanderDraws: true,
        role: true,
        badgePrefs: true,
        discordUsername: true,
        privateProfile: true,
        createdAt: true,
        decks: {
          select: { id: true, name: true, createdAt: true, evolvingPoints: true, evolvingCompatible: true, isPublic: true, cardIds: true, missionIds: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const viewerSession = await auth();
    const viewerId = viewerSession?.user?.id ?? null;
    const viewerIsAdmin = isAdmin({ username: viewerSession?.user?.name, email: viewerSession?.user?.email });
    const canViewDeckContents = !!viewerId && (viewerId === user.id || viewerIsAdmin);

    const limit = page * perPage;

    const [totalRanked, eloRows, aiGames, pvpGames, rankedStreakRows, evolvingStreakRows] = await Promise.all([
      prisma.eloHistory.count({ where: { userId: user.id } }),
      prisma.eloHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.game.findMany({
        where: {
          OR: [{ player1Id: user.id }, { player2Id: user.id }],
          status: 'completed',
          isAiGame: true,
        },
        select: {
          id: true,
          isAiGame: true,
          aiDifficulty: true,
          winnerId: true,
          player1Score: true,
          player2Score: true,
          eloChange: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
      prisma.game.findMany({
        where: {
          OR: [{ player1Id: user.id }, { player2Id: user.id }],
          status: 'completed',
          isAiGame: false,
        },
        select: {
          id: true,
          player1Id: true,
          player2Id: true,
          player1: { select: { username: true } },
          player2: { select: { username: true } },
          winnerId: true,
          player1Score: true,
          player2Score: true,
          eloChange: true,
          completedAt: true,
          gameState: true,
          gameStateGz: true,
        },
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
      prisma.eloHistory.findMany({
        where: { userId: user.id, eloType: 'ranked' },
        orderBy: { createdAt: 'desc' },
        select: { result: true },
        take: 50,
      }),
      prisma.eloHistory.findMany({
        where: { userId: user.id, eloType: 'evolving' },
        orderBy: { createdAt: 'desc' },
        select: { result: true },
        take: 50,
      }),
    ]);

    const countLeadingWins = (rows: { result: string }[]): number => {
      let n = 0;
      for (const r of rows) {
        if (r.result === 'win') n++;
        else break;
      }
      return n;
    };
    const consecutiveWinsRanked = countLeadingWins(rankedStreakRows);
    const consecutiveWinsEvolving = countLeadingWins(evolvingStreakRows);

    const candidateGameIds = eloRows
      .map((r) => r.gameId)
      .filter((x): x is string => !!x);

    const existingGames = candidateGameIds.length > 0
      ? await prisma.game.findMany({
          where: {
            id: { in: candidateGameIds },
            OR: [{ gameState: { not: null } }, { gameStateGz: { not: null } }],
          },
          select: { id: true },
        })
      : [];
    const replayableSet = new Set(existingGames.map((g) => g.id));
    const rankedGameIds = new Set(candidateGameIds);

    type Entry = {
      id: string;
      player1: { username: string } | null;
      player2: { username: string } | null;
      isAiGame: boolean;
      aiDifficulty: string | null;
      winnerId: string | null;
      player1Score: number;
      player2Score: number;
      eloChange: number | null;
      completedAt: string;
      hasReplay: boolean;
    };

    const pvpEntries: Entry[] = eloRows.map((r) => {
      const won = r.result === 'win';
      const isP1 = true;
      return {
        id: r.gameId ?? r.id,
        player1: { username: user.username },
        player2: { username: r.opponentUsername },
        isAiGame: false,
        aiDifficulty: null,
        winnerId: won ? user.id : (r.opponentId ?? null),
        player1Score: r.myScore,
        player2Score: r.opponentScore,
        eloChange: isP1 ? r.delta : -r.delta,
        completedAt: r.createdAt.toISOString(),
        hasReplay: r.gameId ? replayableSet.has(r.gameId) : false,
      };
    });

    const aiEntries: Entry[] = aiGames.map((g) => ({
      id: g.id,
      player1: { username: user.username },
      player2: null,
      isAiGame: true,
      aiDifficulty: g.aiDifficulty,
      winnerId: g.winnerId,
      player1Score: g.player1Score,
      player2Score: g.player2Score,
      eloChange: g.eloChange,
      completedAt: g.completedAt ? g.completedAt.toISOString() : new Date(0).toISOString(),
      hasReplay: false,
    }));

    const casualPvpEntries: Entry[] = pvpGames
      .filter((g) => !rankedGameIds.has(g.id))
      .map((g) => ({
        id: g.id,
        player1: g.player1 ? { username: g.player1.username } : null,
        player2: g.player2 ? { username: g.player2.username } : null,
        isAiGame: false,
        aiDifficulty: null,
        winnerId: g.winnerId,
        player1Score: g.player1Score,
        player2Score: g.player2Score,
        eloChange: null,
        completedAt: g.completedAt ? g.completedAt.toISOString() : new Date(0).toISOString(),
        hasReplay: g.gameState !== null || g.gameStateGz !== null,
      }));

    const merged = [...pvpEntries, ...casualPvpEntries, ...aiEntries].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
    const totalGames = totalRanked + casualPvpEntries.length + aiGames.length;
    const recentGames = merged.slice((page - 1) * perPage, limit);

    const backfillDeckIds: string[] = [];
    const decks = user.decks.map((d) => {
      let compatible = d.evolvingCompatible;
      if (!compatible && d.evolvingPoints <= EVOLVING_MAX_POINTS) {
        compatible = deckUsesOnlyAllowedSets(d.cardIds, d.missionIds);
        if (compatible) backfillDeckIds.push(d.id);
      }
      return {
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        evolvingPoints: d.evolvingPoints,
        evolvingCompatible: compatible,
        isPublic: d.isPublic,
        ...((canViewDeckContents || d.isPublic) ? { cardIds: d.cardIds, missionIds: d.missionIds } : {}),
      };
    });

    if (backfillDeckIds.length > 0) {
      prisma.deck.updateMany({
        where: { id: { in: backfillDeckIds } },
        data: { evolvingCompatible: true },
      }).catch(() => {});
    }

    const modeStatRows = await prisma.userModeStat.findMany({
      where: { userId: user.id },
      select: { mode: true, games: true, wins: true, losses: true },
    }).catch(() => [] as Array<{ mode: string; games: number; wins: number; losses: number }>);
    const modeStats: Record<string, { games: number; wins: number; losses: number }> = {};
    for (const r of modeStatRows) modeStats[r.mode] = { games: r.games, wins: r.wins, losses: r.losses };

    const seasonBadges = await prisma.seasonRanking.findMany({
      where: { userId: user.id },
      orderBy: { rank: 'asc' },
      select: { seasonId: true, badge: true, league: true, rank: true, elo: true },
    }).catch(() => [] as Array<{ seasonId: string; badge: string | null; league: string | null; rank: number; elo: number }>);

    const awardBadges = await prisma.playerBadge.findMany({
      where: { userId: user.id },
      orderBy: { awardedAt: 'asc' },
      distinct: ['badge'],
      select: { badge: true, awardedAt: true },
    }).catch(() => [] as Array<{ badge: string; awardedAt: Date }>);

    const { decks: _omit, ...userWithoutDecks } = user;
    void _omit;
    const follow = await getFollowState(viewerId, user.id);
    const viewerIsFriend = !!viewerId && viewerId !== user.id && !!(await prisma.friendship.findFirst({
      where: { status: 'accepted', OR: [{ senderId: viewerId, receiverId: user.id }, { senderId: user.id, receiverId: viewerId }] },
      select: { id: true },
    }));
    return NextResponse.json({
      ...userWithoutDecks,
      isPrivate: user.privateProfile === true,
      viewerIsFriend,
      decks,
      canViewDeckContents,
      recentGames,
      totalGames,
      page,
      perPage,
      consecutiveWinsRanked,
      consecutiveWinsEvolving,
      modeStats,
      seasonBadges,
      awardBadges,
      followerCount: follow.followerCount,
      followingCount: follow.followingCount,
      viewerFollowing: follow.following,
    });
  } catch (err) {
    console.error('[profile] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
