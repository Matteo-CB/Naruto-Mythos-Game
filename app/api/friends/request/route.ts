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
    const { receiverId } = body;

    if (!receiverId) {
      return NextResponse.json(
        { error: 'Missing receiverId' },
        { status: 400 },
      );
    }

    if (receiverId === userId) {
      return NextResponse.json(
        { error: 'Cannot send friend request to yourself' },
        { status: 400 },
      );
    }

    // Check if receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });

    if (!receiver) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      );
    }

    // Check existing friendship in both directions
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return NextResponse.json(
          { error: 'Already friends' },
          { status: 400 },
        );
      }

      // Pending request from receiver to sender -> auto-accept
      if (
        existing.status === 'pending' &&
        existing.senderId === receiverId &&
        existing.receiverId === userId
      ) {
        const friendship = await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'accepted' },
          include: {
            sender: { select: { id: true, username: true, elo: true } },
            receiver: { select: { id: true, username: true, elo: true } },
          },
        });

        emitToUser(receiverId, 'friend:request-accepted', {
          friendshipId: friendship.id,
          friend: {
            id: friendship.receiver.id,
            username: friendship.receiver.username,
            elo: friendship.receiver.elo,
          },
        });

        return NextResponse.json({ friendship }, { status: 201 });
      }

      // Pending request from sender to receiver -> already sent
      if (
        existing.status === 'pending' &&
        existing.senderId === userId &&
        existing.receiverId === receiverId
      ) {
        return NextResponse.json(
          { error: 'Request already sent' },
          { status: 400 },
        );
      }

      // Declined request -> allow re-sending by creating a new one
      if (existing.status === 'declined') {
        await prisma.friendship.delete({ where: { id: existing.id } });
      }
    }

    const friendship = await prisma.friendship.create({
      data: {
        senderId: userId,
        receiverId,
        status: 'pending',
      },
      include: {
        sender: { select: { id: true, username: true, elo: true } },
        receiver: { select: { id: true, username: true, elo: true } },
      },
    });

    emitToUser(receiverId, 'friend:request-received', {
      friendshipId: friendship.id,
      sender: {
        id: friendship.sender.id,
        username: friendship.sender.username,
        elo: friendship.sender.elo,
      },
    });

    return NextResponse.json({ friendship }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
