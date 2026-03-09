import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { syncDiscordRole } from '@/lib/discord/roleSync';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: { discordId: { not: null } },
      select: { id: true, username: true, discordId: true },
    });

    let synced = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await syncDiscordRole(user.id);
        synced++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      total: users.length,
      synced,
      errors,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
