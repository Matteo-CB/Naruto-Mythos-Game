import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 085/130 - YASHAMARU "Sacrifice" (UC)
 * Chakra: 3 | Power: 2
 * Group: Sand Village
 *
 * SCORE [arrow]: Defeat this character. If you do, defeat another character in this mission.
 *   - This effect is optional. The player can decline to activate it.
 *   - If activated:
 *     1. First, defeat Yashamaru himself (self-destruction).
 *     2. If the self-defeat was successful, select another character in this mission
 *        (friendly or enemy) to defeat as well.
 *   - The actual execution (self-defeat + second defeat) is handled by the
 *     EffectEngine's YASHAMARU085_CONFIRM_SELF_DEFEAT case.
 */

function handleYashamaru085Score(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;
  if (!sourceCard) {
    return { state }; // Character no longer in play
  }

  // Present the entire effect as optional: player can decline
  // When confirmed, the EffectEngine handles self-defeat + second target selection
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
