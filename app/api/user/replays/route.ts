import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = session.user.id;
  const gameId = request.nextUrl.searchParams.get('gameId');

  const games = await prisma.game.findMany({
    where: {
      status: 'completed',
      OR: [{ player1Id: uid }, { player2Id: uid }],
      ...(gameId ? { id: gameId } : {}),
    },
    orderBy: { completedAt: 'desc' },
    take: gameId ? 1 : 20,
    select: {
      id: true, player1Id: true, player2Id: true, winnerId: true,
      player1Score: true, player2Score: true, isAiGame: true, completedAt: true,
      player1: { select: { username: true } }, player2: { select: { username: true } },
    },
  });

  const replays = games.map((g) => ({
    gameId: g.id,
    player1Name: g.player1?.username ?? 'Player 1',
    player2Name: g.player2?.username ?? (g.isAiGame ? 'AI' : 'Player 2'),
    winnerName: g.winnerId === g.player1Id ? (g.player1?.username ?? null) : g.winnerId === g.player2Id ? (g.player2?.username ?? null) : null,
    player1Score: g.player1Score,
    player2Score: g.player2Score,
    isAiGame: g.isAiGame,
    completedAt: g.completedAt,
  }));

  return NextResponse.json({ replays });
}
