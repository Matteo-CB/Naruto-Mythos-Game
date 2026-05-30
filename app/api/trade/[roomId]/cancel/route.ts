import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { emitTradeUpdate } from '@/lib/socket/tradeHandlers';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
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
  if (room.status !== 'pending' && room.status !== 'active') {
    return NextResponse.json({ error: 'Cannot cancel', errorKey: 'trade.error.closed' }, { status: 409 });
  }

  await prisma.tradeRoom.update({
    where: { id: roomId },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });

  emitTradeUpdate(roomId, 'trade:cancelled', { roomId, by: userId });

  return NextResponse.json({ ok: true });
}
