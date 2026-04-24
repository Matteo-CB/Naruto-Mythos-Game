import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { inviteId } = body;

    if (!inviteId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    
    const invite = await prisma.matchInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 },
      );
    }

    if (invite.receiverId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: 'Invitation is no longer pending' },
        { status: 400 },
      );
    }

    
    if (invite.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 400 },
      );
    }

    
    let roomCode = generateRoomCode();
    let existingRoom = await prisma.room.findUnique({ where: { code: roomCode } });
    while (existingRoom) {
      roomCode = generateRoomCode();
      existingRoom = await prisma.room.findUnique({ where: { code: roomCode } });
    }

    
    const updatedInvite = await prisma.matchInvite.update({
      where: { id: inviteId },
      data: {
        status: 'accepted',
        roomCode,
      },
    });

    
    await prisma.room.create({
      data: {
        code: roomCode,
        hostId: invite.senderId,
        guestId: session.user.id,
        status: 'waiting',
        isPrivate: true,
      },
    });

    
    const receiver = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, username: true, elo: true },
    });

    
    emitToUser(invite.senderId, 'match:invite-accepted', {
      inviteId: updatedInvite.id,
      roomCode,
      receiver: {
        id: receiver!.id,
        username: receiver!.username,
        elo: receiver!.elo,
      },
    });

    return NextResponse.json({ invite: updatedInvite, roomCode });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
