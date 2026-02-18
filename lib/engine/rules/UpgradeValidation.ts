import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '../types';

/**
 * Check if a card can be used to upgrade a target character.
 * Rules:
 * - Same character name
 * - Strictly higher chakra cost
 * - Player must have enough chakra for the cost difference
 */
export function canUpgradeCharacter(
  newCard: CharacterCard,
  targetChar: CharacterInPlay,
  playerChakra: number,
): { valid: boolean; costDiff: number; reason?: string } {
  const topCard = targetChar.stack.length > 0
    ? targetChar.stack[targetChar.stack.length - 1]
    : targetChar.card;

  // Must be same name
  if (newCard.name_fr.toUpperCase() !== topCard.name_fr.toUpperCase()) {
    return { valid: false, costDiff: 0, reason: 'Different character names.' };
  }

  // Must have strictly higher cost
  if (newCard.chakra <= topCard.chakra) {
    return { valid: false, costDiff: 0, reason: 'New card must have strictly higher chakra cost.' };
  }

  const costDiff = newCard.chakra - topCard.chakra;

  // Must have enough chakra for the difference
  if (playerChakra < costDiff) {
    return { valid: false, costDiff, reason: `Not enough chakra. Need ${costDiff}, have ${playerChakra}.` };
  }

  return { valid: true, costDiff };
}
