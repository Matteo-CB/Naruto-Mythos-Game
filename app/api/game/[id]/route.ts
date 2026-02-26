import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const game = await prisma.game.findUnique({
      where: { id },
      select: {
        id: true,
        player1Id: true,
        player2Id: true,
        isAiGame: true,
        aiDifficulty: true,
        status: true,
        winnerId: true,
        player1Score: true,
        player2Score: true,
        eloChange: true,
        gameState: true,
        createdAt: true,
        completedAt: true,
        player1: { select: { username: true } },
        player2: { select: { username: true } },
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json(game);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// Save replay data for an existing game
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { gameState } = body;

    if (!gameState) {
      return NextResponse.json({ error: 'Missing gameState' }, { status: 400 });
    }

    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Verify the user was a player in this game
    if (game.player1Id !== session.user.id && game.player2Id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Don't overwrite if already saved
    if (game.gameState) {
      return NextResponse.json({ message: 'Replay already saved' });
    }

    await prisma.game.update({
      where: { id },
      data: { gameState },
    });

    return NextResponse.json({ message: 'Replay saved' });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
