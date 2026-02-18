import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    // Fetch incoming pending invitations (where current user is receiver)
    const incoming = await prisma.matchInvite.findMany({
      where: {
        receiverId: session.user.id,
        status: 'pending',
        expiresAt: { gt: now },
      },
      include: {
        sender: {
          select: { id: true, username: true, elo: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch outgoing pending invitations (where current user is sender)
    const outgoing = await prisma.matchInvite.findMany({
      where: {
        senderId: session.user.id,
        status: 'pending',
        expiresAt: { gt: now },
      },
      include: {
        receiver: {
          select: { id: true, username: true, elo: true },
        },
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
