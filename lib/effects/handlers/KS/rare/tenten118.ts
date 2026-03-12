import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 118/130 - TENTEN "Rising Twin Dragons" (R)
 * Card 118/130 A - TENTEN "Twin Rising Dragons" (RA)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team Guy, Jutsu
 *
 * AMBUSH: Defeat a hidden character in this mission.
 *   If the defeated character had a printed Power of 3 or less,
 *   defeat a hidden character in play.
 *
 * Two-step effect:
 *   1. Select and defeat a hidden character in THIS mission.
 *   2. If the defeated character's printed Power was <= 3,
 *      select and defeat another hidden character anywhere in play.
 *
 * Since the second step depends on the result of the first, this effect
 * uses target selection to first pick the hidden character in the mission.
 * Resolution of the follow-up defeat (step 2) is handled by the target
 * resolution system.
 */
function handleTenten118Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Pre-check: find hidden characters in this mission (any player's)
  let hasHiddenTarget = false;
  for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
    if (char.isHidden) {
      hasHiddenTarget = true;
      break;
    }
  }

  // If no hidden characters in this mission, effect fizzles
  if (!hasHiddenTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (118): No hidden characters in this mission to defeat.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-118-R' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN118_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Tenten (118) AMBUSH: Defeat a hidden character in this mission.',
    descriptionKey: 'game.effect.desc.tenten118ConfirmAmbush',
  };
}

export function registerTenten118Handlers(): void {
  registerEffect('KS-118-R', 'AMBUSH', handleTenten118Ambush);
  // RA variant shares the same effect handler
  registerEffect('KS-118-RA', 'AMBUSH', handleTenten118Ambush);
}
