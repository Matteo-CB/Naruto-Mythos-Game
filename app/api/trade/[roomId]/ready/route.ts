import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { executeTrade } from '@/lib/trade/executeTrade';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';
import { emitTradeUpdate } from '@/lib/socket/tradeHandlers';

ensureQuestPersistenceListener();

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { roomId } = await params;

  let body: { ready?: unknown };
  try {
    body = await req.json();
  } catch {
    body = { ready: true };
  }
  const ready = body.ready !== false;

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
  const updated = await prisma.tradeRoom.update({
    where: { id: roomId },
    data: isCreator ? { creatorReady: ready } : { guestReady: ready },
  });

  if (updated.creatorReady && updated.guestReady) {
    const result = await executeTrade(roomId);
    if (!result.success) {
      emitTradeUpdate(roomId, 'trade:error', { roomId, error: result.error });
      return NextResponse.json({ ok: false, executed: false, error: result.error, errorKey: 'trade.error.executeFailed' }, { status: 409 });
    }
    const creatorMoved = updated.creatorOffer.length + updated.guestOffer.length;
    emitQuestEvent('trade.completed', updated.creatorId, { partnerId: updated.guestId });
    emitQuestEvent('trade.completed', updated.guestId, { partnerId: updated.creatorId });
    if (creatorMoved > 0) {
      emitQuestEvent('trade.cards.traded', updated.creatorId, { delta: creatorMoved });
      emitQuestEvent('trade.cards.traded', updated.guestId, { delta: creatorMoved });
    }
    emitTradeUpdate(roomId, 'trade:executed', {
      roomId,
      creatorOffer: updated.creatorOffer,
      guestOffer: updated.guestOffer,
    });
    return NextResponse.json({ ok: true, executed: true });
  }

  emitTradeUpdate(roomId, 'trade:ready-changed', { roomId, side: isCreator ? 'creator' : 'guest', ready });
  return NextResponse.json({ ok: true, executed: false });
}
