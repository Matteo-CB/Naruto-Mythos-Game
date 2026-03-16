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
 * GET /api/admin/players?search=xxx
 * Search players by username
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';

  const users = await prisma.user.findMany({
    where: search ? { username: { contains: search, mode: 'insensitive' } } : {},
    select: {
      id: true, username: true, elo: true,
      wins: true, losses: true, draws: true,
      role: true, discordUsername: true, discordId: true,
      createdAt: true,
    },
    orderBy: { elo: 'desc' },
    take: 50,
  });

  return NextResponse.json({ users });
}

/**
 * POST /api/admin/players
 * Actions: reset-player, set-elo, set-role, delete-games
 */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { action, userId } = body;

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  switch (action) {
    case 'reset-player': {
      // Reset ELO, W/L/D, delete all games
      await prisma.user.update({
        where: { id: userId },
        data: { elo: 500, wins: 0, losses: 0, draws: 0, discordHighestElo: 0 },
      });
      const deleted = await prisma.game.deleteMany({
        where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
      });
      syncDiscordRole(userId).catch(() => {});
      return NextResponse.json({ success: true, gamesDeleted: deleted.count });
    }

    case 'set-elo': {
      const { elo } = body;
      if (typeof elo !== 'number' || elo < 0) return NextResponse.json({ error: 'Invalid ELO' }, { status: 400 });
      await prisma.user.update({ where: { id: userId }, data: { elo } });
      syncDiscordRole(userId).catch(() => {});
      return NextResponse.json({ success: true });
    }

    case 'set-role': {
      const { role } = body;
      if (!['user', 'tester', 'admin'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      await prisma.user.update({ where: { id: userId }, data: { role } });
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
