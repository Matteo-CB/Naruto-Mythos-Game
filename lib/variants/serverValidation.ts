import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { getCardById } from '@/lib/data/cardIndex';
import { isLockedVariantCard } from './isVariant';
import { getOwnedVariantIds } from './inventory';
import { isForceUnlockedCard } from './forceUnlock';

export interface DeckVariantCheckResult {
  ok: boolean;
  lockedCardIds: string[];
}

export async function validateDeckVariantUnlocks(
  userId: string,
  cardIds: ReadonlyArray<string>,
): Promise<DeckVariantCheckResult> {
  const variantIdsInDeck: string[] = [];
  for (const id of cardIds) {
    if (isForceUnlockedCard(id)) continue;
    const card = getCardById(id);
    if (card && isLockedVariantCard(card)) variantIdsInDeck.push(id);
  }
  if (variantIdsInDeck.length === 0) return { ok: true, lockedCardIds: [] };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true },
  });
  if (!user) return { ok: false, lockedCardIds: variantIdsInDeck };
  if (isAdmin({ username: user.username, email: user.email })) {
    return { ok: true, lockedCardIds: [] };
  }

  const owned = await getOwnedVariantIds(userId);
  const locked = variantIdsInDeck.filter((id) => !owned.has(id));
  return { ok: locked.length === 0, lockedCardIds: locked };
}
