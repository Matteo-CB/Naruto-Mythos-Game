import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 045/130 - ANKO MITARASHI (UC)
 * Chakra: 4 | Power: 3
 * Group: Leaf Village | Keywords: Jutsu
 *
 * AMBUSH: Defeat a hidden enemy character in play (any mission).
 *   - Find all hidden enemy characters across all missions.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 *   - Defeat the target using defeatEnemyCharacter (respects replacement effects).
 */

function handleAnko045Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all hidden enemy characters across all missions
  const validTargets: string[] = [];
  const targetMissionMap: Record<string, number> = {};

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
        targetMissionMap[char.instanceId] = i;
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Anko Mitarashi (045): No hidden enemy character in play to defeat.',
      'game.log.effect.noTarget', { card: 'ANKO MITARASHI', id: '045/130' }) } };
  }

  // Auto-apply if exactly one target
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const missionIdx = targetMissionMap[targetId];
    let newState = defeatEnemyCharacter(state, missionIdx, targetId, sourcePlayer);
    newState = { ...newState, log: logAction(newState.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DEFEAT',
      `Anko Mitarashi (045): Defeated a hidden enemy character in mission ${missionIdx + 1} (ambush).`,
      'game.log.effect.defeat', { card: 'ANKO MITARASHI', id: '045/130', target: '' }) };
    return { state: newState };
  }

  // Multiple targets: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ANKO_DEFEAT_HIDDEN_ENEMY',
    validTargets,
    description: 'Select a hidden enemy character in play to defeat.',
  };
}

export function registerHandler(): void {
  registerEffect('045/130', 'AMBUSH', handleAnko045Ambush);
}
