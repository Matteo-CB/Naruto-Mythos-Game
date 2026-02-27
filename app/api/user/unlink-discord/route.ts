import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordId: true, password: true },
    });

    if (!user?.discordId) {
      return NextResponse.json({ error: 'No Discord linked' }, { status: 400 });
    }

    // Prevent unlinking if user has no password (Discord-only account)
    if (!user.password) {
      return NextResponse.json(
        { error: 'Cannot unlink Discord from a Discord-only account' },
        { status: 400 },
      );
    }

    // Remove Discord account link
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: 'discord',
      },
    });

    // Clear Discord fields on user
    await prisma.user.update({
      where: { id: session.user.id },
      data: { discordId: null, discordUsername: null },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
