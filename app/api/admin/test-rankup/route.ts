import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { sendRankUpForUser } from '@/lib/discord/rankUpWebhook';

const PLACEMENT_MATCHES_REQUIRED = 5;

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];


export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: { discordId: { not: null } },
      select: { username: true, elo: true, wins: true, losses: true, draws: true, discordId: true },
    });

    const eligible = users.filter(u => (u.wins + u.losses + u.draws) >= PLACEMENT_MATCHES_REQUIRED);

    const BATCH = 5;
    let sent = 0;
    for (let i = 0; i < eligible.length; i += BATCH) {
      const slice = eligible.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        slice.map(u => sendRankUpForUser(u.username, u.discordId, u.elo, u.wins + u.losses + u.draws)),
      );
      sent += results.filter(r => r.status === 'fulfilled').length;
    }

    return NextResponse.json({ success: true, sent, total: users.length, eligible: eligible.length });
  } catch (error) {
    console.error('[test-rankup] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
