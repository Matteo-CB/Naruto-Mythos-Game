import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 088/130 - HAKU (Common)
 * Chakra: 2 | Power: 2
 * Group: Independent | Keywords: Rogue Ninja
 * MAIN: Draw 1 card. If you do, you must put 1 card from your hand on top of your deck.
 *
 * Draws 1 card, then the player must place 1 card from their hand on top of their deck.
 * The "put on top" is mandatory if a card was drawn. If the deck is empty and no card is
 * drawn, the second part does not trigger.
 */
function handleHaku088Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, nothing happens
  if (playerState.deck.length === 0) {
    return { state };
  }

  // Draw 1 card
  const newState = { ...state };
  const newPlayerState = { ...newState[sourcePlayer] };
  const newDeck = [...newPlayerState.deck];
  const drawnCard = newDeck.shift()!;
  newPlayerState.deck = newDeck;
  newPlayerState.hand = [...newPlayerState.hand, drawnCard];
  newState[sourcePlayer] = newPlayerState;

  // Now the player must put 1 card from hand on top of deck
  // This requires a pending action for the player to choose which card
  const handIndices = newPlayerState.hand.map((_, idx) => String(idx));

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'PUT_CARD_ON_DECK',
    validTargets: handIndices,
    description: 'You must put 1 card from your hand on top of your deck.',
  };
}

export function registerHandler(): void {
  registerEffect('088/130', 'MAIN', handleHaku088Main);
}
