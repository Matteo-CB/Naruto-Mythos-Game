import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        elo: true,
        wins: true,
        losses: true,
        draws: true,
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

    // Get recent games
    const recentGames = await prisma.game.findMany({
      where: {
        OR: [{ player1Id: user.id }, { player2Id: user.id }],
        status: 'completed',
      },
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
      take: 20,
    });

    return NextResponse.json({ ...user, recentGames });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
