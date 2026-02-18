import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await params;

    const friendship = await prisma.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: 'Friendship not found' },
        { status: 404 },
      );
    }

    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to remove this friendship' },
        { status: 403 },
      );
    }

    const otherUserId =
      friendship.senderId === userId
        ? friendship.receiverId
        : friendship.senderId;

    await prisma.friendship.delete({ where: { id } });

    emitToUser(otherUserId, 'friend:removed', { friendshipId: id });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
