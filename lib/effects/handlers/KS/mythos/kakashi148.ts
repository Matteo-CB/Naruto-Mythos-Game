import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function kakashi148MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';

  if (state.edgeLockedFor != null && state.edgeLockedFor === opponent) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kakashi Hatake (148): The opponent locked the Edge this round, it cannot be taken.',
          'game.log.effect.kakashi148Locked',
          { card: 'KAKASHI HATAKE', id: 'KS-148-M' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI148_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.kakashi148Confirm',
  };
}

export function registerKakashi148Handlers(): void {
  registerEffect('KS-148-M', 'MAIN', kakashi148MainHandler);
}
