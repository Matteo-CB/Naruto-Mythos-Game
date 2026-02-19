import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 088/130 - HAKU (Common)
 * Chakra: 2 | Power: 2
 * Group: Independent | Keywords: Rogue Ninja
 * MAIN: Draw 1 card. If you do, you must put 1 card from your hand on top of your deck.
 *
 * Draws 1 card, then asks the player to choose which card to put back on top
 * of their deck. The put-back is mandatory per card text ("you must").
 * If the deck is empty (no card drawn), the effect fizzles entirely.
 */
function handleHaku088Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, nothing happens
  if (playerState.deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Haku (088): Deck is empty, cannot draw.',
      'game.log.effect.noTarget', { card: 'HAKU', id: '088/130' }) } };
  }

  // Draw 1 card
  const newDeck = [...playerState.deck];
  const drawnCard = newDeck.shift()!;
  const newHand = [...playerState.hand, drawnCard];

  const newPlayerState = {
    ...playerState,
    deck: newDeck,
    hand: newHand,
  };

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_DRAW',
    `Haku (088): Drew 1 card. Must put 1 card back on top of deck.`,
    'game.log.effect.draw',
    { card: 'HAKU', id: '088/130', count: 1 },
  );

  const newState = {
    ...state,
    [sourcePlayer]: newPlayerState,
    log,
  };

  // Create hand indices as valid targets for the put-back selection
  const handIndices = newHand.map((_, i) => String(i));

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'PUT_CARD_ON_DECK',
    validTargets: handIndices,
    description: `Haku (088): Choose a card from your hand to put on top of your deck.`,
  };
}

export function registerHandler(): void {
  registerEffect('088/130', 'MAIN', handleHaku088Main);
}
