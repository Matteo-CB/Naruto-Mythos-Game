import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cleanupOldGames } from '@/lib/db/gameCleanup';
import { deckUsesOnlyAllowedSets } from '@/lib/evolving/computePoints';
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
        elo: true,
        evolvingElo: true,
        wins: true,
        losses: true,
        draws: true,
        role: true,
        badgePrefs: true,
        discordUsername: true,
        createdAt: true,
        decks: {
          select: { id: true, name: true, createdAt: true, evolvingPoints: true, evolvingCompatible: true, cardIds: true, missionIds: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const limit = page * perPage;

    const [totalRanked, eloRows, aiGames, evolvingWins, evolvingLosses] = await Promise.all([
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
      prisma.eloHistory.count({ where: { userId: user.id, eloType: 'evolving', result: 'win' } }),
      prisma.eloHistory.count({ where: { userId: user.id, eloType: 'evolving', result: 'loss' } }),
    ]);

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

    const merged = [...pvpEntries, ...aiEntries].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
    const totalGames = totalRanked + aiGames.length;
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
      };
    });

    if (backfillDeckIds.length > 0) {
      prisma.deck.updateMany({
        where: { id: { in: backfillDeckIds } },
        data: { evolvingCompatible: true },
      }).catch(() => {});
    }

    const { decks: _omit, ...userWithoutDecks } = user;
    void _omit;
    return NextResponse.json({ ...userWithoutDecks, decks, evolvingWins, evolvingLosses, recentGames, totalGames, page, perPage });
  } catch (err) {
    console.error('[profile] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
