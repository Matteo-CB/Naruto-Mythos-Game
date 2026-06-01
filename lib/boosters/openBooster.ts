import { prisma } from '@/lib/db/prisma';
import type { CardData } from '@/lib/engine/types';
import { rollVariantBooster, type RollMode } from '@/lib/variants/rollBooster';
import { incrementVariant, getOwnedVariantIds } from '@/lib/variants/inventory';
import { DUPLICATE_XP_BY_RARITY, isVariantRarity, type VariantRarity } from '@/lib/variants/constants';
import { awardXp } from '@/lib/battlepass/awardXp';

export class NoBoosterError extends Error {
  code = 'NO_BOOSTER' as const;
  constructor(message = 'No booster available for this set') {
    super(message);
  }
}

export class UnknownUserError extends Error {
  code = 'UNKNOWN_USER' as const;
  constructor(userId: string) {
    super(`User not found: ${userId}`);
  }
}

export interface OpenBoosterResult {
  cards: CardData[];
  newCardIds: string[];
  duplicateCardIds: string[];
  remainingInventory: number;
  duplicateXpAwarded: number;
}

export interface OpenBoosterOptions {
  mode?: RollMode;
}

export async function openBooster(
  userId: string,
  setId: string,
  options: OpenBoosterOptions = {},
): Promise<OpenBoosterResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new UnknownUserError(userId);

  const decremented = await prisma.boosterInventory.updateMany({
    where: { userId, setId, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
  if (decremented.count === 0) {
    throw new NoBoosterError();
  }

  const cards = rollVariantBooster(setId, { mode: options.mode });

  const existing = await getOwnedVariantIds(userId);
  const newCardIds: string[] = [];
  const duplicateCardIds: string[] = [];
  let duplicateXpAwarded = 0;
  for (const card of cards) {
    if (existing.has(card.cardId)) {
      duplicateCardIds.push(card.cardId);
      if (isVariantRarity(card.rarity)) {
        duplicateXpAwarded += DUPLICATE_XP_BY_RARITY[card.rarity as VariantRarity] ?? 0;
      }
    } else {
      existing.add(card.cardId);
      newCardIds.push(card.cardId);
    }
    await incrementVariant(userId, card.cardId);
  }

  if (duplicateXpAwarded > 0) {
    await awardXp(userId, duplicateXpAwarded);
  }

  const inv = await prisma.boosterInventory.findUnique({
    where: { userId_setId: { userId, setId } },
    select: { count: true },
  });
  const remainingInventory = inv?.count ?? 0;

  return { cards, newCardIds, duplicateCardIds, remainingInventory, duplicateXpAwarded };
}

export async function grantBoosters(
  userId: string,
  setId: string,
  quantity: number,
): Promise<{ newCount: number }> {
  if (quantity <= 0) throw new Error('grantBoosters: quantity must be positive');
  const result = await prisma.boosterInventory.upsert({
    where: { userId_setId: { userId, setId } },
    create: { userId, setId, count: quantity },
    update: { count: { increment: quantity } },
    select: { count: true },
  });
  return { newCount: result.count };
}

export async function getInventoryForUser(userId: string): Promise<Array<{ setId: string; count: number }>> {
  const rows = await prisma.boosterInventory.findMany({
    where: { userId },
    select: { setId: true, count: true },
  });
  return rows.map((r) => ({ setId: r.setId, count: r.count }));
}
