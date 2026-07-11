import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const [user, notifications] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { chatIntroSeenAt: true, usernameResetRequired: true } }),
    prisma.playerNotification.findMany({
      where: { userId, seenAt: null },
      orderBy: { createdAt: 'asc' },
      take: 10,
    }),
  ]);
  return NextResponse.json({
    chatIntroSeen: user?.chatIntroSeenAt != null,
    usernameResetRequired: user?.usernameResetRequired === true,
    notifications: notifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      payload: n.payload,
      createdAt: n.createdAt.getTime(),
    })),
  });
}
