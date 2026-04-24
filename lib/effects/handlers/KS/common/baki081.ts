import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleBaki081Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  
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
