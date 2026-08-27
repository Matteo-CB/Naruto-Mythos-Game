import { getAllCards } from '@/lib/data/cardLoader';
import { getSetStatus } from '@/lib/data/sets/registry';
import { parseCardId } from '@/lib/variants/isVariant';
import { FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';

function isPreReleaseSet(setId: string): boolean {
  const status = getSetStatus(setId);
  return status === 'coming_soon' || status === 'revealing';
}

const SETS_TEMPORAIREMENT_DEBLOQUES = new Set<string>();

function estTemporairementDebloque(setId: string): boolean {
  return SETS_TEMPORAIREMENT_DEBLOQUES.has(setId);
}

export function isForceUnlockedCard(cardId: string): boolean {
  if (FORCE_UNLOCKED_CARD_IDS.has(cardId)) return true;
  const parsed = parseCardId(cardId);
  if (!parsed) return false;
  return isPreReleaseSet(parsed.set) || estTemporairementDebloque(parsed.set);
}

export function getForceUnlockedCardIds(): Set<string> {
  const ids = new Set<string>(FORCE_UNLOCKED_CARD_IDS);
  for (const card of getAllCards()) {
    if (isPreReleaseSet(card.set) || estTemporairementDebloque(card.set)) ids.add(card.id);
  }
  return ids;
}
