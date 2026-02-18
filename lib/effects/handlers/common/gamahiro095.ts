import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 095/130 - GAMAHIRO (Common)
 * Chakra: 4 | Power: 6
 * Group: Independent | Keywords: Summon
 * MAIN (1): If there's a friendly character in this mission, draw a card.
 * MAIN (2) [continuous]: At the end of the round, you must return this character to your hand.
 *
 * The first MAIN effect triggers on play: draw a card if there's already a friendly character
 * in this mission. The second MAIN is continuous and handled in EndPhase.ts.
 */
function handleGamahiro095Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Check for any friendly character in this mission (not self)
  const hasFriendly = friendlyChars.some(
    (char) => char.instanceId !== sourceCard.instanceId,
  );

  if (!hasFriendly) {
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
  registerEffect('095/130', 'MAIN', handleGamahiro095Main);
}
