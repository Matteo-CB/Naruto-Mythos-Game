import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleShikamaru021Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  if (state.edgeHolder !== sourcePlayer) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (021): Player does not hold the Edge token.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-021-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU021_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shikamaru021ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-021-C', 'MAIN', handleShikamaru021Main);
}
