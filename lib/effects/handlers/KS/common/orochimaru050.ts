import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 050/130 - OROCHIMARU (Common)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Sannin
 * AMBUSH: Look at a hidden enemy character in this mission. If it costs 3 or less, take
 * control of that character and move it to your side.
 *
 * This effect only triggers when Orochimaru is revealed from hidden (AMBUSH).
 * 1. Select a hidden enemy character in the same mission.
 * 2. Look at it (reveal to the player who controls Orochimaru).
 * 3. If the revealed card's printed chakra cost is 3 or less, take control of it
 *    (move it to the source player's side of the same mission).
 *
 * Note: Hidden characters have cost 0 when targeted by enemy effects, but the AMBUSH
 * explicitly says "if it costs 3 or less" referring to the actual card's printed cost
 * after looking at it. The "look at" step reveals the actual card before the cost check.
 */
function handleOrochimaru050Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemyChars =
    opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Find hidden enemy characters in this mission
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) {
      validTargets.push(char.instanceId);
    }
  }

  // If no hidden enemies in this mission, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Orochimaru (050): No hidden enemy characters in this mission.',
      'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-050-C' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU050_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.orochimaru050ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-050-C', 'AMBUSH', handleOrochimaru050Ambush);
}
