import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { userCanTrade } from '@/lib/trade/validation';
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
  if (room.guestId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (room.status !== 'pending' && room.status !== 'active') {
    return NextResponse.json({ error: 'Trade closed', errorKey: 'trade.error.closed' }, { status: 409 });
  }
  if (!(await userCanTrade(userId))) {
    return NextResponse.json({ error: 'Tier too low', errorKey: 'trade.error.tierTooLow' }, { status: 403 });
  }

  await prisma.tradeRoom.update({
    where: { id: roomId },
    data: { status: 'active' },
  });

  emitTradeUpdate(roomId, 'trade:joined', { roomId });

  return NextResponse.json({ ok: true });
}
