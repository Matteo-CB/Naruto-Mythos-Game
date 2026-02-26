import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 060/130 - KIDOMARU (UC)
 * Chakra: 5 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * MAIN: Move a character from this mission (any character, friendly or enemy, not self).
 *   - Find all characters in this mission (both sides), excluding self.
 *   - Require target selection for who to move.
 *   - Then require target selection for the destination mission.
 *   - Multi-stage target selection:
 *     Stage 1: KIDOMARU060_CHOOSE_CHARACTER - choose which character to move
 *     Stage 2: KIDOMARU060_CHOOSE_DESTINATION - choose which mission to move them to
 *
 * AMBUSH: Defeat an enemy character with Power 1 or less in play (any mission).
 *   - Find non-hidden enemy characters with effective power <= 1 across all missions.
 *   - If multiple targets, require target selection.
 */

function handleKidomaru060Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Must have more than one mission (need somewhere to move to)
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (060): Only one mission in play, cannot move characters.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-060-UC' }) } };
  }

  // Find all characters in this mission (not self)
  const validTargets: string[] = [];

  for (const char of mission.player1Characters) {
    if (char.instanceId !== sourceCard.instanceId) {
      validTargets.push(char.instanceId);
    }
  }
  for (const char of mission.player2Characters) {
    if (char.instanceId !== sourceCard.instanceId) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (060): No other characters in this mission to move.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-060-UC' }) } };
  }

  // Require target selection for which character to move
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU060_CHOOSE_CHARACTER',
    validTargets,
    description: 'Kidomaru (060): Choose a character in this mission to move to another mission.',
    descriptionKey: 'game.effect.desc.kidomaru060MoveCharacter',
  };
}

function handleKidomaru060Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find enemy characters with effective power <= 1 across all missions (hidden = power 0, valid)
  const validTargets: string[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, opponentPlayer) <= 1) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (060): No enemy character with Power 1 or less in play.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-060-UC' }) } };
  }

  // Require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU060_DEFEAT_LOW_POWER',
    validTargets,
    description: 'Select an enemy character with Power 1 or less in play to defeat.',
    descriptionKey: 'game.effect.desc.kidomaru060DefeatLowPower',
  };
}

export function registerKidomaru060Handlers(): void {
  registerEffect('KS-060-UC', 'MAIN', handleKidomaru060Main);
  registerEffect('KS-060-UC', 'AMBUSH', handleKidomaru060Ambush);
}
