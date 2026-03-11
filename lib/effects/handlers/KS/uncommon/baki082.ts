import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 082/130 - BAKI "Wind Blade" (UC)
 * Chakra: 4 | Power: 4
 * Group: Sand Village | Keywords: Team Baki
 *
 * SCORE [arrow]: Defeat a hidden character in play (friendly or enemy, any mission).
 * UPGRADE: Defeat an enemy character with Power 1 or less in this mission.
 *
 * Both effects get CONFIRM popups. Target selection after confirm is optional (SKIP).
 */

function handleBaki082Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: any hidden characters in play?
  let hasHidden = false;
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) { hasHidden = true; break; }
    }
    if (hasHidden) break;
  }

  if (!hasHidden) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'SCORE_NO_TARGET', 'Baki (082): [SCORE] No hidden characters in play to defeat.',
      'game.log.effect.noTarget', { card: 'BAKI', id: 'KS-082-UC' });
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'BAKI082_CONFIRM_SCORE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Baki (082) SCORE: Defeat a hidden character in play.',
    descriptionKey: 'game.effect.desc.baki082ConfirmScore',
  };
}

function handleBaki082Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  // Pre-check: any enemy with P≤1?
  const hasValidTarget = mission[enemySide].some(
    (char) => getEffectivePower(state, char, enemyPlayer) <= 1,
  );

  if (!hasValidTarget) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Baki (082) UPGRADE: No enemy character with Power 1 or less in this mission.',
      'game.log.effect.noTarget', { card: 'BAKI', id: 'KS-082-UC' });
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'BAKI082_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.baki082ConfirmUpgrade',
  };
}

export function registerBaki082Handlers(): void {
  registerEffect('KS-082-UC', 'SCORE', handleBaki082Score);
  registerEffect('KS-082-UC', 'UPGRADE', handleBaki082Upgrade);
}
