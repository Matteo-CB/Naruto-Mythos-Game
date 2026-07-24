import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitToUser } from '@/lib/socket/io';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';
import { isBlockedEither } from '@/lib/social/blocks';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';
import { ensureMutualFollowForFriends } from '@/lib/social/followSync';

ensureQuestPersistenceListener();

const friendRequestRate = new Map<string, number[]>();
const FRIEND_REQUEST_WINDOW_MS = 60_000;
const FRIEND_REQUEST_MAX = 10;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const now = Date.now();
    const windowStart = now - FRIEND_REQUEST_WINDOW_MS;
    const recent = (friendRequestRate.get(userId) ?? []).filter((t) => t > windowStart);
    if (recent.length >= FRIEND_REQUEST_MAX) {
      return NextResponse.json(
        { error: 'Too many friend requests, please slow down' },
        { status: 429 },
      );
    }
    recent.push(now);
    friendRequestRate.set(userId, recent);

    if (friendRequestRate.size > 5000) {
      for (const [uid, ts] of friendRequestRate) {
        if (ts.length === 0 || ts[ts.length - 1] < windowStart) friendRequestRate.delete(uid);
      }
    }

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

    if (await isBlockedEither(userId, receiverId)) {
      return NextResponse.json(
        { error: 'Unable to send the request', errorKey: 'social.requestUnavailable' },
        { status: 403 },
      );
    }

    
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

        await ensureMutualFollowForFriends(userId, receiverId);

        emitQuestEvent('social.friend.request.accepted', userId);
        emitQuestEvent('social.friend.added', userId);
        emitQuestEvent('social.friend.added', receiverId);

        refreshChatLock(userId, receiverId);
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

    emitQuestEvent('social.friend.request.sent', userId);

    refreshChatLock(userId, receiverId);
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
