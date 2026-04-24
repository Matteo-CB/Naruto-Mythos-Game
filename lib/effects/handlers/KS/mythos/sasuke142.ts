import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function sasuke142MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const playerState = state[ctx.sourcePlayer];

  
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (142): No cards in hand to discard, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-142-M' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE142_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ handSize: playerState.hand.length }),
    descriptionKey: 'game.effect.desc.sasuke142ConfirmMain',
  };
}

export function registerSasuke142Handlers(): void {
  registerEffect('KS-142-M', 'MAIN', sasuke142MainHandler);
}
