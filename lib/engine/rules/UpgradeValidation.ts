import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '../types';


export function canUpgradeCharacter(
  newCard: CharacterCard,
  targetChar: CharacterInPlay,
  playerChakra: number,
): { valid: boolean; costDiff: number; reason?: string } {
  const topCard = targetChar.stack?.length > 0
    ? targetChar.stack[targetChar.stack?.length - 1]
    : targetChar.card;

  
  if (newCard.name_fr.toUpperCase() !== topCard.name_fr.toUpperCase()) {
    return { valid: false, costDiff: 0, reason: 'Different character names.' };
  }

  
  if (newCard.chakra <= topCard.chakra) {
    return { valid: false, costDiff: 0, reason: 'New card must have strictly higher chakra cost.' };
  }

  const costDiff = newCard.chakra - topCard.chakra;

  
  if (playerChakra < costDiff) {
    return { valid: false, costDiff, reason: `Not enough chakra. Need ${costDiff}, have ${playerChakra}.` };
  }

  return { valid: true, costDiff };
}
