import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cleanupOldGames } from '@/lib/db/gameCleanup';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const perPage = 20;

    // Fire-and-forget: clean up games older than 7 days
    cleanupOldGames().catch(() => {});

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

    // Get total game count + paginated games
    const [totalGames, games] = await Promise.all([
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
          gameState: true,
        },
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    const recentGames = games.map(({ gameState, ...rest }) => ({
      ...rest,
      hasReplay: gameState !== null,
    }));

    return NextResponse.json({ ...user, recentGames, totalGames, page, perPage });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
