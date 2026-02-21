import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Find all hidden characters in this mission (any player's)
  const validTargets: string[] = [];
  for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
    if (char.isHidden) {
      validTargets.push(char.instanceId);
    }
  }

  // If no hidden characters in this mission, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (118): No hidden characters in this mission to defeat.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: '118/130' }) } };
  }

  // Requires target selection: which hidden character in this mission to defeat
  // The follow-up (defeat another hidden if Power <= 3) will be handled
  // by the target resolution system after this target is resolved.
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN_118_DEFEAT_HIDDEN_IN_MISSION',
    validTargets,
    description: 'Select a hidden character in this mission to defeat.',
  };
}

export function registerTenten118Handlers(): void {
  registerEffect('118/130', 'AMBUSH', handleTenten118Ambush);
  // RA variant shares the same effect handler
  registerEffect('118/130 A', 'AMBUSH', handleTenten118Ambush);
}
