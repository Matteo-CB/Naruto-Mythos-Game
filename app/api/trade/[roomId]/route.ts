import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { roomId } = await params;

  const room = await prisma.tradeRoom.findUnique({ where: { id: roomId } });
  if (!room) {
    return NextResponse.json({ error: 'Not found', errorKey: 'trade.error.notFound' }, { status: 404 });
  }
  if (room.creatorId !== userId && room.guestId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const otherId = room.creatorId === userId ? room.guestId : room.creatorId;
  const [me, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    prisma.user.findUnique({ where: { id: otherId }, select: { username: true } }),
  ]);

  const side = room.creatorId === userId ? 'creator' : 'guest';

  return NextResponse.json({
    roomId: room.id,
    status: room.status,
    side,
    creatorOffer: room.creatorOffer,
    guestOffer: room.guestOffer,
    creatorReady: room.creatorReady,
    guestReady: room.guestReady,
    myUsername: me?.username ?? '',
    partnerUsername: other?.username ?? '',
  });
}
