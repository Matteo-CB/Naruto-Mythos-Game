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

    const body = await request.json();
    const { receiverId } = body;

    if (!receiverId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    if (receiverId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot invite yourself' },
        { status: 400 },
      );
    }

    // Validate friendship exists (accepted, in either direction)
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: session.user.id, receiverId },
          { senderId: receiverId, receiverId: session.user.id },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: 'Must be friends to send a match invitation' },
        { status: 400 },
      );
    }

    // Check for existing pending invite from sender to receiver (not expired)
    const existingInvite = await prisma.matchInvite.findFirst({
      where: {
        senderId: session.user.id,
        receiverId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: 'Invitation already pending' },
        { status: 400 },
      );
    }

    // Look up sender info
    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, username: true, elo: true },
    });

    // Create match invite (expires in 2 minutes)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    const invite = await prisma.matchInvite.create({
      data: {
        senderId: session.user.id,
        receiverId,
        status: 'pending',
        expiresAt,
      },
    });

    // Emit socket event to receiver
    emitToUser(receiverId, 'match:invite-received', {
      inviteId: invite.id,
      sender: {
        id: sender!.id,
        username: sender!.username,
        elo: sender!.elo,
      },
      expiresAt: invite.expiresAt,
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
