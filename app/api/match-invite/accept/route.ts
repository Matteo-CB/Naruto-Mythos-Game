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

    const conflicting = await prisma.tournamentMatch.findFirst({
      where: {
        status: { in: ['in_progress', 'ready'] },
        OR: [
          { player1Id: invite.senderId },
          { player2Id: invite.senderId },
          { player1Id: session.user.id },
          { player2Id: session.user.id },
        ],
        tournament: { status: 'in_progress' },
      },
      select: { id: true, player1Id: true, player2Id: true },
    });
    if (conflicting) {
      const blockedSelf = conflicting.player1Id === session.user.id || conflicting.player2Id === session.user.id;
      return NextResponse.json(
        {
          error: blockedSelf
            ? 'You are currently in a tournament match. Finish it first.'
            : 'The other player is currently in a tournament match. Try again later.',
        },
        { status: 409 },
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
