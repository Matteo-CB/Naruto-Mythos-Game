import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';



function handleYashamaru085Score(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;
  if (!sourceCard) {
    return { state }; // Character no longer in play
  }

  
  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'YASHAMARU085_CONFIRM_SELF_DEFEAT',
    validTargets: [sourceCard.instanceId], // self as the confirmation target
    description: 'Yashamaru (085) SCORE: Defeat this character to then defeat another character in this mission. Activate?',
    descriptionKey: 'game.effect.desc.yashamaru085ScoreConfirm',
    isOptional: true,
  };
}

export function registerHandler(): void {
  registerEffect('KS-085-UC', 'SCORE', handleYashamaru085Score);
}
