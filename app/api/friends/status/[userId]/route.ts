import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUserId = session.user.id;
    const { userId } = await params;

    if (userId === currentUserId) {
      return NextResponse.json({ status: 'self' });
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json({ status: 'none' });
    }

    if (friendship.status === 'accepted') {
      return NextResponse.json({
        status: 'accepted',
        friendshipId: friendship.id,
      });
    }

    if (friendship.status === 'pending') {
      if (friendship.senderId === currentUserId) {
        return NextResponse.json({
          status: 'pending_sent',
          friendshipId: friendship.id,
        });
      }
      return NextResponse.json({
        status: 'pending_received',
        friendshipId: friendship.id,
      });
    }

    // Declined or other status -> treat as none
    return NextResponse.json({ status: 'none' });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
