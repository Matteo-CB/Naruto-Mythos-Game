import { getAllCards } from '@/lib/data/cardLoader';
import { getSetStatus } from '@/lib/data/sets/registry';
import { parseCardId } from '@/lib/variants/isVariant';
import { FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';

function isPreReleaseSet(setId: string): boolean {
  const status = getSetStatus(setId);
  return status === 'coming_soon' || status === 'revealing';
}

export function isForceUnlockedCard(cardId: string): boolean {
  if (FORCE_UNLOCKED_CARD_IDS.has(cardId)) return true;
  const parsed = parseCardId(cardId);
  return parsed ? isPreReleaseSet(parsed.set) : false;
}

export function getForceUnlockedCardIds(): Set<string> {
  const ids = new Set<string>(FORCE_UNLOCKED_CARD_IDS);
  for (const card of getAllCards()) {
    if (isPreReleaseSet(card.set)) ids.add(card.id);
  }
  return ids;
}
