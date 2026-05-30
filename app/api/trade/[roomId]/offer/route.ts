import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { MAX_OFFER_SIZE, isFullyExcluded } from '@/lib/trade/inventory-rules';
import { emitTradeUpdate } from '@/lib/socket/tradeHandlers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { roomId } = await params;

  let body: { cardIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'trade.error.invalidBody' }, { status: 400 });
  }
  const cardIds = Array.isArray(body.cardIds) ? body.cardIds.filter((c): c is string => typeof c === 'string') : null;
  if (!cardIds) {
    return NextResponse.json({ error: 'Invalid cardIds', errorKey: 'trade.error.invalidBody' }, { status: 400 });
  }
  if (cardIds.length > MAX_OFFER_SIZE) {
    return NextResponse.json({ error: 'Too many cards', errorKey: 'trade.error.tooMany' }, { status: 400 });
  }
  if (cardIds.some(isFullyExcluded)) {
    return NextResponse.json({ error: 'Card not tradeable', errorKey: 'trade.error.excluded' }, { status: 400 });
  }

  const room = await prisma.tradeRoom.findUnique({ where: { id: roomId } });
  if (!room) {
    return NextResponse.json({ error: 'Not found', errorKey: 'trade.error.notFound' }, { status: 404 });
  }
  if (room.creatorId !== userId && room.guestId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (room.status !== 'pending' && room.status !== 'active') {
    return NextResponse.json({ error: 'Trade closed', errorKey: 'trade.error.closed' }, { status: 409 });
  }

  const isCreator = room.creatorId === userId;
  await prisma.tradeRoom.update({
    where: { id: roomId },
    data: isCreator
      ? { creatorOffer: cardIds, creatorReady: false, guestReady: false }
      : { guestOffer: cardIds, creatorReady: false, guestReady: false },
  });

  emitTradeUpdate(roomId, 'trade:offer-updated', {
    roomId,
    side: isCreator ? 'creator' : 'guest',
    cardIds,
  });

  return NextResponse.json({ ok: true });
}
