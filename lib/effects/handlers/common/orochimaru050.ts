import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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
      'game.log.effect.noTarget', { card: 'OROCHIMARU', id: '050/130' }) } };
  }

  // Requires target selection: which hidden enemy to look at
  // The actual look + take-control logic is resolved by the game engine
  // after the target is selected (it checks the actual card cost).
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU_LOOK_AND_STEAL',
    validTargets,
    description: 'Select a hidden enemy character in this mission to look at. If it costs 3 or less, take control of it.',
  };
}

export function registerHandler(): void {
  registerEffect('050/130', 'AMBUSH', handleOrochimaru050Ambush);
}
