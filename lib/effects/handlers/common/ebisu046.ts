import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 046/130 - EBISU (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Pouvoir
 * MAIN: If there is a friendly non-hidden character with less Power than this character
 * in this mission, draw a card.
 *
 * Checks if there is at least one friendly non-hidden character in the same mission
 * whose base power (printed) is strictly less than Ebisu's power. If so, draws 1 card.
 * Note: We compare base printed power, not including power tokens (as the card says
 * "less Power than this character" referring to the card stats).
 */
function handleEbisu046Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  const sourceTopCard =
    sourceCard.stack.length > 0 ? sourceCard.stack[sourceCard.stack.length - 1] : sourceCard.card;
  const sourcePower = sourceTopCard.power;

  // Check for a friendly non-hidden character with less Power
  const hasLesserFriendly = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.power < sourcePower;
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
