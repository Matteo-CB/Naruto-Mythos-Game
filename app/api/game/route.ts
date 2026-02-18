import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { calculateEloChanges } from '@/lib/elo/elo';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { isAiGame, aiDifficulty } = body;

    const game = await prisma.game.create({
      data: {
        player1Id: session.user.id,
        isAiGame: isAiGame ?? true,
        aiDifficulty: aiDifficulty ?? 'medium',
        status: 'in_progress',
      },
    });

    return NextResponse.json(game, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// Complete a game and apply ELO changes
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { gameId, winnerId, player1Score, player2Score } = body;

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.status === 'completed') {
      return NextResponse.json(
        { error: 'Game already completed' },
        { status: 400 },
      );
    }

    // Apply ELO changes for non-AI rated games
    let eloChange = 0;
    if (!game.isAiGame && game.player1Id && game.player2Id) {
      const player1 = await prisma.user.findUnique({
        where: { id: game.player1Id },
      });
      const player2 = await prisma.user.findUnique({
        where: { id: game.player2Id },
      });

      if (player1 && player2) {
        const result =
          winnerId === game.player1Id
            ? 'player1'
            : winnerId === game.player2Id
              ? 'player2'
              : 'draw';

        const eloChanges = calculateEloChanges(
          player1.elo,
          player2.elo,
          result,
        );
        eloChange = eloChanges.player1Delta;

        // Update player stats
        const p1Stats =
          result === 'player1'
            ? { wins: { increment: 1 } }
            : result === 'player2'
              ? { losses: { increment: 1 } }
              : { draws: { increment: 1 } };
        const p2Stats =
          result === 'player2'
            ? { wins: { increment: 1 } }
            : result === 'player1'
              ? { losses: { increment: 1 } }
              : { draws: { increment: 1 } };

        await Promise.all([
          prisma.user.update({
            where: { id: game.player1Id },
            data: {
              elo: eloChanges.player1NewElo,
              ...p1Stats,
            },
          }),
          prisma.user.update({
            where: { id: game.player2Id },
            data: {
              elo: eloChanges.player2NewElo,
              ...p2Stats,
            },
          }),
        ]);
      }
    }

    const updatedGame = await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'completed',
        winnerId,
        player1Score,
        player2Score,
        eloChange,
        completedAt: new Date(),
      },
    });

    return NextResponse.json(updatedGame);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
