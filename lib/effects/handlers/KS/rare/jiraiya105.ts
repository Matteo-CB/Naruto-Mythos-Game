import type { CharacterInPlay } from '@/lib/engine/types';
import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

function handleJiraiya105Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const costReduction = 3;

  const handTargets = findAffordableSummonsInHand(state, sourcePlayer, costReduction);
  const hiddenTargets = findHiddenSummonsOnBoard(state, sourcePlayer, costReduction);

  const allTargets = [
    ...handTargets.map(i => `HAND_${i}`),
    ...hiddenTargets.map(h => `HIDDEN_${h.instanceId}`),
  ];

  if (allTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (105): No affordable Summon characters available.',
      'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-105-R' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA105_CHOOSE_SUMMON',
    validTargets: allTargets,
    description: JSON.stringify({
      text: 'Jiraiya (105): Choose a Summon character to play (paying 3 less).',
      hiddenChars: hiddenTargets,
      costReduction,
    }),
    descriptionKey: 'game.effect.desc.jiraiya105ChooseSummon',
  };
}

function jiraiya105UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  const validTargets: string[] = enemyChars.map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (105) UPGRADE: No enemy characters in this mission to move.',
      'game.log.effect.noTarget', { card: 'JIRAIYA', id: 'KS-105-R' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA105_MOVE_ENEMY',
    validTargets: validTargets,
    description: 'Jiraiya (105) UPGRADE: Choose an enemy character in this mission to move to another mission.',
    descriptionKey: 'game.effect.desc.jiraiya105MoveEnemy',
  };
}

export function registerJiraiya105Handlers(): void {
  registerEffect('KS-105-R', 'MAIN', handleJiraiya105Main);
  registerEffect('KS-105-R', 'UPGRADE', jiraiya105UpgradeHandler);
}
