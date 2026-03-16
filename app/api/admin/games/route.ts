import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { syncDiscordRole } from '@/lib/discord/roleSync';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.name && ADMIN_USERNAMES.includes(session.user.name);
}

/**
 * GET /api/admin/games?userId=xxx
 * Get games for a specific player
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const games = await prisma.game.findMany({
    where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
    select: {
      id: true,
      player1: { select: { id: true, username: true } },
      player2: { select: { id: true, username: true } },
      isAiGame: true,
      aiDifficulty: true,
      winnerId: true,
      player1Score: true,
      player2Score: true,
      eloChange: true,
      status: true,
      completedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ games });
}

/**
 * DELETE /api/admin/games
 * Delete a game and restore ELO for both players
 */
export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('id');

  if (!gameId) return NextResponse.json({ error: 'Missing game id' }, { status: 400 });

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true, player1Id: true, player2Id: true,
      winnerId: true, eloChange: true, isAiGame: true,
      status: true,
    },
  });

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  // Restore ELO and W/L/D if the game was completed and ranked
  if (game.status === 'completed' && !game.isAiGame && game.player1Id && game.player2Id && game.eloChange) {
    const eloChange = game.eloChange;

    // Determine result to reverse
    const p1Won = game.winnerId === game.player1Id;
    const p2Won = game.winnerId === game.player2Id;
    const isDraw = !game.winnerId;

    // Reverse ELO
    const p1EloRevert = -eloChange;
    const p2EloRevert = eloChange; // eloChange is from p1's perspective

    // Reverse W/L/D
    const p1StatsRevert = p1Won
      ? { wins: { decrement: 1 } }
      : p2Won
        ? { losses: { decrement: 1 } }
        : { draws: { decrement: 1 } };
    const p2StatsRevert = p2Won
      ? { wins: { decrement: 1 } }
      : p1Won
        ? { losses: { decrement: 1 } }
        : { draws: { decrement: 1 } };

    await Promise.all([
      prisma.user.update({
        where: { id: game.player1Id },
        data: { elo: { increment: p1EloRevert }, ...p1StatsRevert },
      }),
      prisma.user.update({
        where: { id: game.player2Id },
        data: { elo: { increment: p2EloRevert }, ...p2StatsRevert },
      }),
    ]);

    // Ensure ELO doesn't go below 100
    await prisma.user.updateMany({
      where: { elo: { lt: 100 } },
      data: { elo: 100 },
    });

    // Re-sync Discord roles
    syncDiscordRole(game.player1Id).catch(() => {});
    syncDiscordRole(game.player2Id).catch(() => {});
  }

  // Delete the game
  await prisma.game.delete({ where: { id: gameId } });

  return NextResponse.json({ success: true, eloRestored: !!game.eloChange });
}
