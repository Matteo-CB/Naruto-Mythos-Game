import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const incoming = await prisma.friendship.findMany({
      where: {
        receiverId: userId,
        status: 'pending',
      },
      include: {
        sender: { select: { id: true, username: true, elo: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const outgoing = await prisma.friendship.findMany({
      where: {
        senderId: userId,
        status: 'pending',
      },
      include: {
        receiver: { select: { id: true, username: true, elo: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ incoming, outgoing });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
