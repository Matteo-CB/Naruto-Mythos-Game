import { getCharacterById, getMissionById, getCardById } from '@/lib/data/cardIndex';

export function hasScenario(cardId: string, _effectIndex = 0): boolean {
  const card = getCharacterById(cardId);
  if (card) return (card.effects ?? []).length > 0;
  const mission = getMissionById(cardId);
  if (mission) return (mission.effects ?? []).length > 0;
  const any = getCardById(cardId);
  return !!any && (any.effects ?? []).length > 0;
}
