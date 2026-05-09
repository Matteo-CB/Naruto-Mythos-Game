import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { syncAllDiscordRoles } from '@/lib/discord/roleSync';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    syncAllDiscordRoles().catch((err) => {
      console.error('[admin/discord-sync] Bulk sync failed:', err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ queued: true, message: 'Discord role sync started in background. Check server logs for progress.' });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
