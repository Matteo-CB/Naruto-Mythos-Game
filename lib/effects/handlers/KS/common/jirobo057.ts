import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { compterMissionsAvecSonQuatre } from '@/lib/effects/soundFourCount';


function handleJirobo057Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  const soundFourMissionCount = compterMissionsAvecSonQuatre(state, sourcePlayer, sourceCard.instanceId);

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jirobo (057): No missions with a friendly Sound Four character.',
      'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-057-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO057_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: false,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.jirobo057ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-057-C', 'MAIN', handleJirobo057Main);
}
