import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 006/130 - SHIZUNE "Tir d'Aiguilles prepare" (UC)
 * Chakra: 3 | Power: 2
 * Group: Leaf Village | Keywords: Weapon
 *
 * MAIN: Move an enemy character with Power 3 or less in play.
 *   - Find non-hidden enemy characters across all missions with effective power <= 3.
 *   - If a valid target is found, require target selection for which enemy to move
 *     and which mission to move to.
 *
 * UPGRADE: Gain 2 Chakra.
 *   - When triggered as an upgrade, also add 2 to the player's chakra pool.
 */

function getEffectivePower(char: import('../../../engine/types').CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function handleShizune006Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;

  let newState = { ...state };

  // UPGRADE bonus: Gain 2 Chakra
  if (isUpgrade) {
    const ps = { ...newState[sourcePlayer] };
    ps.chakra += 2;
    newState[sourcePlayer] = ps;

    newState = { ...newState, log: logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_CHAKRA',
      'Shizune (006): Gained 2 Chakra (upgrade effect).',
      'game.log.effect.gainChakra',
      { card: 'SHIZUNE', id: '006/130', amount: 2 },
    ) };
  }

  // MAIN: Move an enemy character with Power 3 or less
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTargets: string[] = [];
  for (const mission of newState.activeMissions) {
    for (const char of mission[enemySide]) {
      if (!char.isHidden && getEffectivePower(char) <= 3) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles (but upgrade chakra already applied)
  if (validTargets.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shizune (006): No enemy character with Power 3 or less in play to move.',
      'game.log.effect.noTarget', { card: 'SHIZUNE', id: '006/130' }) } };
  }

  // Requires target selection: which enemy to move (and then which mission to move to)
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_ENEMY_POWER_3_OR_LESS',
    validTargets,
    description: 'Select an enemy character with Power 3 or less to move to another mission.',
  };
}

export function registerShizune006Handlers(): void {
  registerEffect('006/130', 'MAIN', handleShizune006Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to apply the 2 Chakra bonus
}
