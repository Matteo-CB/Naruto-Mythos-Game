import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';

ensureQuestPersistenceListener();

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

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { gameBanned: true, gameBanUntil: true },
    });
    if (me?.gameBanned && (!me.gameBanUntil || me.gameBanUntil > new Date())) {
      return NextResponse.json(
        { error: 'You are banned from playing online games' },
        { status: 403 },
      );
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

    const claim = await prisma.matchInvite.updateMany({
      where: { id: inviteId, status: 'pending' },
      data: { status: 'accepted', roomCode },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: 'Invitation is no longer pending' },
        { status: 409 },
      );
    }
    const updatedInvite = await prisma.matchInvite.findUnique({ where: { id: inviteId } });


    await prisma.room.create({
      data: {
        code: roomCode,
        hostId: invite.senderId,
        guestId: session.user.id,
        status: 'waiting',
        isPrivate: true,
      },
    });

    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: invite.senderId, receiverId: session.user.id },
          { senderId: session.user.id, receiverId: invite.senderId },
        ],
      },
      select: { id: true },
    });
    if (friendship) {
      emitQuestEvent('social.match.played.friend', invite.senderId);
      emitQuestEvent('social.match.played.friend', session.user.id);
    }

    
    const receiver = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, username: true, elo: true },
    });

    
    emitToUser(invite.senderId, 'match:invite-accepted', {
      inviteId: updatedInvite!.id,
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
