import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function sasuke146MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  
  
  if (state.edgeHolder !== ctx.sourcePlayer) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (146): Does not hold the Edge token - cannot give it. Effect fizzles.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE146_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ sourceMissionIndex: ctx.sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.sasuke146ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-146-M', 'MAIN', sasuke146MainHandler);
}
