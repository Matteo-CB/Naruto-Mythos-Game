import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 088/130 - HAKU (Common)
 * Chakra: 2 | Power: 2
 * Group: Independent | Keywords: Rogue Ninja
 * MAIN: Draw 1 card. If you do, you must put 1 card from your hand on top of your deck.
 *
 * Auto-resolves: draws 1 card, then puts the last card in hand (the one just
 * drawn) back on top of the deck. The put-back is mandatory per card text.
 * If the deck is empty (no card drawn), the effect fizzles entirely.
 */
function handleHaku088Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, nothing happens
  if (playerState.deck.length === 0) {
    return { state };
  }

  // Draw 1 card
  const newDeck = [...playerState.deck];
  const drawnCard = newDeck.shift()!;
  const newHand = [...playerState.hand, drawnCard];

  // Mandatory: put 1 card from hand back on top of deck
  // Auto-resolve: put back the lowest-power card in hand (least useful)
  let worstIndex = 0;
  let worstPower = Infinity;
  for (let i = 0; i < newHand.length; i++) {
    const card = newHand[i];
    const power = card.card_type === 'character' ? (card.power ?? 0) : 0;
    if (power < worstPower) {
      worstPower = power;
      worstIndex = i;
    }
  }
  const [cardToReturn] = newHand.splice(worstIndex, 1);
  const finalDeck = [cardToReturn, ...newDeck];

  const newPlayerState = {
    ...playerState,
    deck: finalDeck,
    hand: newHand,
  };

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_DRAW',
    `Haku (088): Drew 1 card and put 1 card back on top of deck.`,
  );

  return {
    state: {
      ...state,
      [sourcePlayer]: newPlayerState,
      log,
    },
  };
}

export function registerHandler(): void {
  registerEffect('088/130', 'MAIN', handleHaku088Main);
}
