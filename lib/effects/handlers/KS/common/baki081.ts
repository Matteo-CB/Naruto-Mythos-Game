import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 081/130 - BAKI (Common)
 * Chakra: 3 | Power: 2
 * Group: Sand Village | Keywords: Team Baki
 * SCORE [arrow]: Draw a card.
 *
 * When the player wins the mission where Baki is assigned, draw 1 card.
 * Confirmation popup before drawing (SCORE effects are optional).
 */
function handleBaki081Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  // Pre-check: deck empty → fizzle
  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer,
          'SCORE_NO_TARGET', 'Baki (081): Deck is empty, cannot draw.',
          'game.log.effect.noTarget', { card: 'BAKI', id: 'KS-081-C' }),
      },
    };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'BAKI081_CONFIRM_SCORE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Baki (081) SCORE: Draw 1 card.',
    descriptionKey: 'game.effect.desc.baki081ConfirmScore',
  };
}

export function registerHandler(): void {
  registerEffect('KS-081-C', 'SCORE', handleBaki081Score);
}
