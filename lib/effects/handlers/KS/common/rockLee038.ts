import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 038/130 - ROCK LEE "Entrainement au Poing violent" (Common)
 * Chakra: 2 | Power: 3
 * Group: Leaf Village | Keywords: Team Guy
 * AMBUSH: POWERUP 1.
 *
 * When revealed from hidden, adds 1 power token to this character (self).
 * This effect only triggers as AMBUSH (when a hidden character is revealed),
 * never when played directly face-visible.
 */
function handleRockLee038Ambush(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  // Confirmation popup before POWERUP
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ROCKLEE038_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.rockLee038ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-038-C', 'AMBUSH', handleRockLee038Ambush);
}
