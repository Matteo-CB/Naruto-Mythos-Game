import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 017/130 - CHOJI AKIMICHI "Decuplement" (Common)
 * Chakra: 2 | Power: 1
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 * MAIN: POWERUP 3.
 *
 * Adds 3 power tokens to this character (self).
 */
function handleChoji017Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Confirmation popup before applying POWERUP 3
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI017_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.choji017ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-017-C', 'MAIN', handleChoji017Main);
}
