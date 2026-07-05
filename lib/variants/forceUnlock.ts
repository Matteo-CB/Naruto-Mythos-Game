import { getAllCards } from '@/lib/data/cardLoader';
import { SET_REGISTRY } from '@/lib/data/sets/registry';
import { parseCardId } from '@/lib/variants/isVariant';
import { FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';

function isPreReleaseSet(setId: string): boolean {
  return SET_REGISTRY[setId]?.status === 'coming_soon';
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
