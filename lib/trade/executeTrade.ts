import { prisma } from '@/lib/db/prisma';
import { decrementVariant, incrementVariant } from '@/lib/variants/inventory';
import { validateOffer } from './inventory-rules';
import { userOwnsOffer, areFriends, userCanTrade } from './validation';

export interface TradeExecutionResult {
  success: boolean;
  error?: 'not_found' | 'not_ready' | 'invalid_offer' | 'insufficient' | 'already_done' | 'not_friends' | 'tier_too_low';
}

export async function executeTrade(tradeRoomId: string): Promise<TradeExecutionResult> {
  const claim = await prisma.tradeRoom.updateMany({
    where: { id: tradeRoomId, status: 'active', creatorReady: true, guestReady: true },
    data: { status: 'executing' },
  });

  const room = await prisma.tradeRoom.findUnique({ where: { id: tradeRoomId } });
  if (!room) return { success: false, error: 'not_found' };

  if (claim.count === 0) {
    if (room.status === 'completed' || room.status === 'cancelled' || room.status === 'executing') {
      return { success: false, error: 'already_done' };
    }
    return { success: false, error: 'not_ready' };
  }

  const revertToActive = async () => {
    await prisma.tradeRoom.update({
      where: { id: tradeRoomId },
      data: { status: 'active', creatorReady: false, guestReady: false },
    });
  };

  if (!(await areFriends(room.creatorId, room.guestId))) {
    await revertToActive();
    return { success: false, error: 'not_friends' };
  }
  if (!(await userCanTrade(room.creatorId)) || !(await userCanTrade(room.guestId))) {
    await revertToActive();
    return { success: false, error: 'tier_too_low' };
  }

  const offerCheck = validateOffer(room.creatorOffer, room.guestOffer);
  if (!offerCheck.valid) {
    await revertToActive();
    return { success: false, error: 'invalid_offer' };
  }

  const creatorOwns = await userOwnsOffer(room.creatorId, room.creatorOffer);
  const guestOwns = await userOwnsOffer(room.guestId, room.guestOffer);
  if (!creatorOwns || !guestOwns) {
    await revertToActive();
    return { success: false, error: 'insufficient' };
  }

  const decremented: Array<{ userId: string; cardId: string }> = [];

  const tryDecrement = async (userId: string, cardId: string): Promise<boolean> => {
    const ok = await decrementVariant(userId, cardId);
    if (ok) decremented.push({ userId, cardId });
    return ok;
  };

  const rollback = async () => {
    for (const d of decremented) {
      await incrementVariant(d.userId, d.cardId);
    }
    await revertToActive();
  };

  for (const cardId of room.creatorOffer) {
    const ok = await tryDecrement(room.creatorId, cardId);
    if (!ok) {
      await rollback();
      return { success: false, error: 'insufficient' };
    }
  }
  for (const cardId of room.guestOffer) {
    const ok = await tryDecrement(room.guestId, cardId);
    if (!ok) {
      await rollback();
      return { success: false, error: 'insufficient' };
    }
  }

  for (const cardId of room.creatorOffer) {
    await incrementVariant(room.guestId, cardId);
  }
  for (const cardId of room.guestOffer) {
    await incrementVariant(room.creatorId, cardId);
  }

  await prisma.tradeRoom.update({
    where: { id: tradeRoomId },
    data: { status: 'completed', completedAt: new Date() },
  });

  await prisma.tradeLog.create({
    data: {
      tradeRoomId,
      senderId: room.creatorId,
      receiverId: room.guestId,
      senderCards: room.creatorOffer,
      receiverCards: room.guestOffer,
    },
  });

  return { success: true };
}
