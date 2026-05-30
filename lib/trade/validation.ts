import { prisma } from '@/lib/db/prisma';
import { canUserTrade } from './userTier';

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const f = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    },
    select: { id: true },
  });
  return f !== null;
}

export async function userCanTrade(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { elo: true },
  });
  if (!user) return false;
  return canUserTrade(user.elo);
}

export function countOccurrences(cards: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

export async function userOwnsOffer(userId: string, offer: string[]): Promise<boolean> {
  if (offer.length === 0) return true;
  const needed = countOccurrences(offer);
  const rows = await prisma.variantInventory.findMany({
    where: { userId, cardId: { in: [...needed.keys()] } },
    select: { cardId: true, count: true },
  });
  const owned = new Map(rows.map((r) => [r.cardId, r.count]));
  for (const [cardId, qty] of needed) {
    if ((owned.get(cardId) ?? 0) < qty) return false;
  }
  return true;
}
