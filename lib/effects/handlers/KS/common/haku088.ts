import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleHaku088Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  
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
