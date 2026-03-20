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

    const result = await syncAllDiscordRoles();

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
