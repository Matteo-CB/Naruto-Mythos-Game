import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cleanupOldGames } from '@/lib/db/gameCleanup';

let lastCleanup = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const perPage = 20;

    // Throttled fire-and-forget: clean up old games at most once per 5 minutes
    const now = Date.now();
    if (now - lastCleanup > 5 * 60 * 1000) {
      lastCleanup = now;
      cleanupOldGames().catch(() => {});
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        elo: true,
        wins: true,
        losses: true,
        draws: true,
        role: true,
        badgePrefs: true,
        discordUsername: true,
        createdAt: true,
        decks: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const gameFilter = {
      OR: [{ player1Id: user.id }, { player2Id: user.id }],
      status: 'completed' as const,
    };

    // Get total game count + paginated games + replay IDs in parallel
    // Don't load gameState (can be hundreds of KB per game) — only check existence
    const [totalGames, games, gamesWithReplay] = await Promise.all([
      prisma.game.count({ where: gameFilter }),
      prisma.game.findMany({
        where: gameFilter,
        select: {
          id: true,
          player1: { select: { username: true } },
          player2: { select: { username: true } },
          isAiGame: true,
          aiDifficulty: true,
          winnerId: true,
          player1Score: true,
          player2Score: true,
          eloChange: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.game.findMany({
        where: { ...gameFilter, gameState: { not: null } },
        select: { id: true },
      }),
    ]);

    const replayIds = new Set(gamesWithReplay.map((g) => g.id));

    const recentGames = games.map((game) => ({
      ...game,
      hasReplay: replayIds.has(game.id),
    }));

    return NextResponse.json({ ...user, recentGames, totalGames, page, perPage });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
