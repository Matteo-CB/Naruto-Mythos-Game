import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { blockUser, getBlockedList } from '@/lib/social/blocks';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const blocked = await getBlockedList(session.user.id);
  return NextResponse.json({ blocked });
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
    if (!targetId || targetId === userId) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await blockUser(userId, targetId);
    refreshChatLock(userId, targetId);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
