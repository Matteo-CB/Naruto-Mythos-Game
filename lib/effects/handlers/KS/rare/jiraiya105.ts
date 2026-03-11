import type { CharacterInPlay } from '@/lib/engine/types';
import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';
import { EffectEngine } from '@/lib/effects/EffectEngine';

/**
 * Card 105/130 - JIRAIYA (R)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Play a Summon from hand or from hidden on board, paying 3 less chakra.
 * UPGRADE: Move an enemy character from this mission to another mission (separate effect).
 *
 * Confirmation popup before both MAIN and UPGRADE target selections.
 */

function handleJiraiya105Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
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

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA105_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Jiraiya (105) MAIN: Play a Summon character paying 3 less chakra.',
    descriptionKey: 'game.effect.desc.jiraiya105ConfirmMain',
  };
}

function jiraiya105UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  const charResult = EffectEngine.findCharByInstanceId(state, sourceCard.instanceId);
  const actualMissionIndex = charResult?.missionIndex ?? ctx.sourceMissionIndex;

  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[actualMissionIndex];
  if (!mission) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (105) UPGRADE: Mission not found.',
      'game.log.effect.noTarget', { card: 'JIRAIYA', id: 'KS-105-R' }) } };
  }
  const enemyChars = mission[enemySide];

  const validTargets: string[] = enemyChars.map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (105) UPGRADE: No enemy characters in this mission to move.',
      'game.log.effect.noTarget', { card: 'JIRAIYA', id: 'KS-105-R' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA105_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: actualMissionIndex }),
    descriptionKey: 'game.effect.desc.jiraiya105ConfirmUpgrade',
  };
}

export function registerJiraiya105Handlers(): void {
  registerEffect('KS-105-R', 'MAIN', handleJiraiya105Main);
  registerEffect('KS-105-R', 'UPGRADE', jiraiya105UpgradeHandler);
}
