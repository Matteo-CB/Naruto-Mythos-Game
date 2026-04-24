import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleAsuma024Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA024_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.asuma024ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-024-UC', 'AMBUSH', handleAsuma024Ambush);
}
