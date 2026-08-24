import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { compterMissionsAvecSonQuatre } from '@/lib/effects/soundFourCount';


function handleSakon061Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  const soundFourMissionCount = compterMissionsAvecSonQuatre(state, sourcePlayer, sourceCard.instanceId);

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakon (061): No missions with friendly Sound Four characters.',
      'game.log.effect.noTarget', { card: 'SAKON', id: 'KS-061-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKON061_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.sakon061ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-061-C', 'MAIN', handleSakon061Main);
}
