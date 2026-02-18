import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 081/130 - BAKI (Common)
 * Chakra: 3 | Power: 2
 * Group: Sand Village | Keywords: Team Baki
 * SCORE [arrow]: Draw a card.
 *
 * When the player wins the mission where Baki is assigned, draw 1 card.
 */
function handleBaki081Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

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
  registerEffect('081/130', 'SCORE', handleBaki081Score);
}
