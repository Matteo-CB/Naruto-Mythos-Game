import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 021/130 - SHIKAMARU NARA (Common)
 * Chakra: 1 | Power: 0 (no power stat in data)
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: If you have the Edge, draw a card.
 *
 * Checks if the source player currently holds the Edge token. If so, draws 1 card.
 */
function handleShikamaru021Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Check if this player has the Edge
  if (state.edgeHolder !== sourcePlayer) {
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
  registerEffect('021/130', 'MAIN', handleShikamaru021Main);
}
