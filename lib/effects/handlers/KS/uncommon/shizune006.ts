import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

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

function handleShizune006Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: any enemy with Power 3 or less?
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  let hasTarget = false;
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, opponentPlayer) <= 3) {
        hasTarget = true;
        break;
      }
    }
    if (hasTarget) break;
  }

  if (!hasTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shizune (006): No enemy character with Power 3 or less in play to move.',
      'game.log.effect.noTarget', { card: 'SHIZUNE', id: 'KS-006-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIZUNE006_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shizune006ConfirmMain',
  };
}

function handleShizune006Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  // Confirmation popup before applying chakra gain
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIZUNE006_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shizune006ConfirmUpgrade',
  };
}

export function registerShizune006Handlers(): void {
  registerEffect('KS-006-UC', 'MAIN', handleShizune006Main);
  registerEffect('KS-006-UC', 'UPGRADE', handleShizune006Upgrade);
}
