import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 099/130 - PAKKUN (Common)
 * Chakra: 1 | Power: 1
 * Group: Independent | Keywords: Ninja Hound
 * SCORE [arrow]: Move this character.
 *
 * When the player wins the mission where Pakkun is assigned, Pakkun can be moved to a
 * different mission. This is useful for repositioning Pakkun for future turns.
 */
function handlePakkun099Score(ctx: EffectContext): EffectResult {
  const { state, sourceCard, sourceMissionIndex } = ctx;

  // Find valid destination missions (any mission other than the current one)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== sourceMissionIndex) {
      validTargets.push(String(i));
    }
  }

  // If no other missions exist, effect fizzles
  if (validTargets.length === 0) {
    return { state };
  }

  // Requires target selection: which mission to move to
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_SELF_TO_MISSION',
    validTargets,
    description: `Select a mission to move ${sourceCard.card.name_fr} to.`,
  };
}

export function registerHandler(): void {
  registerEffect('099/130', 'SCORE', handlePakkun099Score);
}
