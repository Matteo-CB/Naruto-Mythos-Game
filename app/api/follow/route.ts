import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { followUser, unfollowUser, getFollowState } from '@/lib/social/followSync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetId = typeof body.targetId === 'string' ? body.targetId : '';
  const follow = body.follow === true;
  if (!targetId || targetId === session.user.id) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, privateProfile: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (follow && target.privateProfile) {
    const friendship = await prisma.friendship.findFirst({
      where: { status: 'accepted', OR: [{ senderId: session.user.id, receiverId: targetId }, { senderId: targetId, receiverId: session.user.id }] },
      select: { id: true },
    });
    if (!friendship) {
      return NextResponse.json({ error: 'Private account', errorKey: 'social.privateFollow' }, { status: 403 });
    }
  }

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: session.user.id, blockedId: targetId },
        { blockerId: targetId, blockedId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return NextResponse.json({ error: 'Blocked' }, { status: 403 });

  if (follow) {
    await followUser(session.user.id, targetId);
  } else {
    await unfollowUser(session.user.id, targetId);
  }

  const state = await getFollowState(session.user.id, targetId);
  return NextResponse.json({ success: true, ...state });
}
