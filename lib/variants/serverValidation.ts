import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { getCardById } from '@/lib/data/cardIndex';
import { isHoloId, holoBaseId, isHoloEligibleCard } from '@/lib/holo/holoId';
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
  const restrictedIdsInDeck: string[] = [];
  for (const id of cardIds) {
    if (isHoloId(id)) {
      restrictedIdsInDeck.push(id);
      continue;
    }
    if (isForceUnlockedCard(id)) continue;
    const card = getCardById(id);
    if (card && isLockedVariantCard(card)) restrictedIdsInDeck.push(id);
  }
  if (restrictedIdsInDeck.length === 0) return { ok: true, lockedCardIds: [] };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true },
  });
  if (!user) return { ok: false, lockedCardIds: restrictedIdsInDeck };
  if (isAdmin({ username: user.username, email: user.email })) {
    const invalidHolos = restrictedIdsInDeck.filter(
      (id) => isHoloId(id) && !isHoloEligibleCard(getCardById(holoBaseId(id))),
    );
    return { ok: invalidHolos.length === 0, lockedCardIds: invalidHolos };
  }

  const owned = await getOwnedVariantIds(userId);
  const locked = restrictedIdsInDeck.filter((id) => {
    if (isHoloId(id)) {
      if (!isHoloEligibleCard(getCardById(holoBaseId(id)))) return true;
      return !owned.has(id);
    }
    return !owned.has(id);
  });
  return { ok: locked.length === 0, lockedCardIds: locked };
}
