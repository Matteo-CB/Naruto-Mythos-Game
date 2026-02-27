import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { syncDiscordRole } from '@/lib/discord/roleSync';

const ADMIN_USERNAMES = ['Kutxyt', 'admin'];

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await prisma.user.updateMany({
      data: {
        elo: 500,
        wins: 0,
        losses: 0,
        draws: 0,
        discordHighestElo: 0,
      },
    });

    // Auto-sync Discord roles for all users with linked accounts
    const discordUsers = await prisma.user.findMany({
      where: { discordId: { not: null } },
      select: { id: true },
    });
    for (const user of discordUsers) {
      syncDiscordRole(user.id).catch(() => {});
    }

    return NextResponse.json({
      message: `Reset ${result.count} users to ELO 500, W/L/D = 0`,
      count: result.count,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
