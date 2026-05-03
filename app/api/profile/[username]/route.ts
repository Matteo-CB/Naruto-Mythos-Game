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

    const baseGameSelect = {
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
    } as const;

    const limit = page * perPage;

    const [countAsP1, countAsP2, gamesAsP1, gamesAsP2] = await Promise.all([
      prisma.game.count({ where: { player1Id: user.id, status: 'completed' } }),
      prisma.game.count({ where: { player2Id: user.id, status: 'completed' } }),
      prisma.game.findMany({
        where: { player1Id: user.id, status: 'completed' },
        select: baseGameSelect,
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
      prisma.game.findMany({
        where: { player2Id: user.id, status: 'completed' },
        select: baseGameSelect,
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
    ]);

    const totalGames = countAsP1 + countAsP2;
    const merged = [...gamesAsP1, ...gamesAsP2].sort((a, b) => {
      const ta = a.completedAt ? a.completedAt.getTime() : 0;
      const tb = b.completedAt ? b.completedAt.getTime() : 0;
      return tb - ta;
    });
    const pageGames = merged.slice((page - 1) * perPage, limit);

    let replayIds = new Set<string>();
    if (pageGames.length > 0) {
      const withReplay = await prisma.game.findMany({
        where: {
          id: { in: pageGames.map((g) => g.id) },
          gameState: { not: null },
        },
        select: { id: true },
      });
      replayIds = new Set(withReplay.map((g) => g.id));
    }

    const recentGames = pageGames.map((game) => ({
      ...game,
      hasReplay: replayIds.has(game.id),
    }));

    return NextResponse.json({ ...user, recentGames, totalGames, page, perPage });
  } catch (err) {
    console.error('[profile] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
