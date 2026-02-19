import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { calculateCharacterPower } from '../../../engine/phases/PowerCalculation';

/**
 * Card 046/130 - EBISU (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Pouvoir
 * MAIN: If there is a friendly non-hidden character with less Power than this character
 * in this mission, draw a card.
 *
 * "Power" includes base power + power tokens + continuous modifiers (effective power).
 */
function handleEbisu046Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Use effective power (base + tokens + continuous modifiers)
  const sourcePower = calculateCharacterPower(state, sourceCard, sourcePlayer);

  // Check for a friendly non-hidden character with less Power
  const hasLesserFriendly = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const charPower = calculateCharacterPower(state, char, sourcePlayer);
    return charPower < sourcePower;
  });

  if (!hasLesserFriendly) {
    return { state };
  }

  // Draw a card
  const newState = { ...state };
  const playerState = { ...newState[sourcePlayer] };
  if (playerState.deck.length > 0) {
    const newDeck = [...playerState.deck];
    const drawnCard = newDeck.shift()!;
    playerState.deck = newDeck;
    playerState.hand = [...playerState.hand, drawnCard];
  }
  newState[sourcePlayer] = playerState;

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('046/130', 'MAIN', handleEbisu046Main);
}
