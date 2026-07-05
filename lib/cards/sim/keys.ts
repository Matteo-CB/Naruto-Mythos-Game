import { getCharacterById } from '@/lib/data/cardIndex';

export function hasScenario(cardId: string, _effectIndex = 0): boolean {
  const card = getCharacterById(cardId);
  return !!card && (card.effects ?? []).length > 0;
}
