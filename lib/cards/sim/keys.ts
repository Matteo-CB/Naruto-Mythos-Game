import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';

export function hasScenario(cardId: string, _effectIndex = 0): boolean {
  const card = getCharacterById(cardId);
  if (card) return (card.effects ?? []).length > 0;
  const mission = getMissionById(cardId);
  return !!mission && (mission.effects ?? []).length > 0;
}
