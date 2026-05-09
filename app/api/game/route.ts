import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { aiDifficulty } = body;

    const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
    const difficulty = typeof aiDifficulty === 'string' && VALID_DIFFICULTIES.includes(aiDifficulty)
      ? aiDifficulty
      : 'medium';

    const game = await prisma.game.create({
      data: {
        player1Id: session.user.id,
        isAiGame: true,
        aiDifficulty: difficulty,
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

    if (!game.isAiGame) {
      return NextResponse.json(
        { error: 'PvP games are completed server-side via socket and cannot be completed via this route' },
        { status: 403 },
      );
    }

    if (game.player1Id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (game.status === 'completed') {
      return NextResponse.json(
        { error: 'Game already completed' },
        { status: 400 },
      );
    }

    if (typeof player1Score !== 'number' || typeof player2Score !== 'number') {
      return NextResponse.json({ error: 'Invalid scores' }, { status: 400 });
    }

    const updatedGame = await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'completed',
        winnerId: typeof winnerId === 'string' ? winnerId : null,
        player1Score,
        player2Score,
        eloChange: 0,
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
