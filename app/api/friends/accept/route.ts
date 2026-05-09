import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { friendshipId } = body;

    if (!friendshipId) {
      return NextResponse.json(
        { error: 'Missing friendshipId' },
        { status: 400 },
      );
    }

    const existing = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Friend request not found' },
        { status: 404 },
      );
    }

    if (existing.receiverId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to accept this request' },
        { status: 403 },
      );
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request is not pending' },
        { status: 400 },
      );
    }

    const claim = await prisma.friendship.updateMany({
      where: { id: friendshipId, status: 'pending', receiverId: userId },
      data: { status: 'accepted' },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: 'Request is no longer pending' },
        { status: 409 },
      );
    }

    const friendship = await prisma.friendship.findUniqueOrThrow({
      where: { id: friendshipId },
      include: {
        sender: { select: { id: true, username: true, elo: true } },
        receiver: { select: { id: true, username: true, elo: true } },
      },
    });

    emitToUser(friendship.senderId, 'friend:request-accepted', {
      friendshipId: friendship.id,
      friend: {
        id: friendship.receiver.id,
        username: friendship.receiver.username,
        elo: friendship.receiver.elo,
      },
    });

    return NextResponse.json({ friendship });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
