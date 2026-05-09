import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';

const inviteRate = new Map<string, number[]>();
const INVITE_WINDOW_MS = 60 * 60 * 1000;
const INVITE_MAX = 20;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const now = Date.now();
    const windowStart = now - INVITE_WINDOW_MS;
    const recent = (inviteRate.get(userId) ?? []).filter((t) => t > windowStart);
    if (recent.length >= INVITE_MAX) {
      return NextResponse.json(
        { error: 'Too many match invites, please slow down' },
        { status: 429 },
      );
    }
    recent.push(now);
    inviteRate.set(userId, recent);
    if (inviteRate.size > 5000) {
      for (const [k, ts] of inviteRate) {
        if (ts.length === 0 || ts[ts.length - 1] < windowStart) inviteRate.delete(k);
      }
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { gameBanned: true, gameBanUntil: true },
    });
    if (me?.gameBanned && (!me.gameBanUntil || me.gameBanUntil > new Date())) {
      return NextResponse.json(
        { error: 'You are banned from playing online games' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { receiverId } = body;

    if (!receiverId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    if (receiverId === userId) {
      return NextResponse.json(
        { error: 'Cannot invite yourself' },
        { status: 400 },
      );
    }

    
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: 'Must be friends to send a match invitation' },
        { status: 400 },
      );
    }

    
    const existingInvite = await prisma.matchInvite.findFirst({
      where: {
        senderId: userId,
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

    
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, elo: true },
    });

    
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    const invite = await prisma.matchInvite.create({
      data: {
        senderId: userId,
        receiverId,
        status: 'pending',
        expiresAt,
      },
    });

    
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
