import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { sendRankUpForUser } from '@/lib/discord/rankUpWebhook';

const PLACEMENT_MATCHES_REQUIRED = 5;

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

/**
 * POST /api/admin/test-rankup
 * Sends a rank-up notification for every ranked player (Discord linked or not).
 * Admin-only endpoint for testing the webhook.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: { username: true, elo: true, wins: true, losses: true, draws: true, discordId: true },
    });

    let sent = 0;
    for (const user of users) {
      const totalGames = user.wins + user.losses + user.draws;
      if (totalGames < PLACEMENT_MATCHES_REQUIRED) continue;

      await sendRankUpForUser(user.username, user.discordId, user.elo, totalGames);
      sent++;
    }

    return NextResponse.json({ success: true, sent, total: users.length });
  } catch (error) {
    console.error('[test-rankup] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
