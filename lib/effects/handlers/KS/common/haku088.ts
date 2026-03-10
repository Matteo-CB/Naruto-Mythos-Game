import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 088/130 - HAKU (Common)
 * Chakra: 2 | Power: 2
 * Group: Independent | Keywords: Rogue Ninja
 * MAIN: Draw 1 card. If you do, you must put 1 card from your hand on top of your deck.
 *
 * The draw is OPTIONAL ("if you do" implies player choice - no "must" on the draw).
 * If the player chooses to draw, they MUST put 1 card from hand back on top of deck.
 * If the deck is empty, the effect fizzles entirely.
 *
 * Flow:
 * 1. Handler offers optional HAKU088_CONFIRM_DRAW (isOptional: true, skip = do nothing)
 * 2. If player accepts (SELECT_TARGET → EffectEngine HAKU088_CONFIRM_DRAW):
 *    draw 1 card, then push mandatory PUT_CARD_ON_DECK pending (isMandatory: true)
 */
function handleHaku088Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, nothing happens
  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Haku (088): Deck is empty, cannot draw.',
          'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-088-C' }),
      },
    };
  }

  // Offer optional draw - if accepted, EffectEngine draws and chains mandatory put-back
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HAKU088_CONFIRM_DRAW',
    validTargets: ['confirm'],
    isOptional: true,
    description: 'Haku (088): Draw 1 card, then put 1 card from your hand on top of your deck.',
    descriptionKey: 'game.effect.desc.haku088Draw',
  };
}

export function registerHandler(): void {
  registerEffect('KS-088-C', 'MAIN', handleHaku088Main);
}
