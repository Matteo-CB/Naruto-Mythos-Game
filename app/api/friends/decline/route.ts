import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

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
        { error: 'Not authorized to decline this request' },
        { status: 403 },
      );
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request is not pending' },
        { status: 400 },
      );
    }

    await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'declined' },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
