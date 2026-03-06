import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

function handleJiraiya008Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const costReduction = 2;

  const handTargets = findAffordableSummonsInHand(state, sourcePlayer, costReduction);
  const hiddenTargets = findHiddenSummonsOnBoard(state, sourcePlayer, costReduction);

  const allTargets = [
    ...handTargets.map(i => `HAND_${i}`),
    ...hiddenTargets.map(h => `HIDDEN_${h.instanceId}`),
  ];

  if (allTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No affordable Summon characters available.',
      'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-008-UC' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA008_CHOOSE_SUMMON',
    validTargets: allTargets,
    description: JSON.stringify({
      text: 'Jiraiya (008): Choose a Summon character to play (paying 2 less).',
      hiddenChars: hiddenTargets,
      costReduction,
    }),
    descriptionKey: 'game.effect.desc.jiraiya008ChooseSummon',
  };
}

function handleJiraiya008Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const upgradeMission = state.activeMissions[sourceMissionIndex];
  if (!upgradeMission) return { state };

  const hideTargets: string[] = [];
  for (const char of upgradeMission[enemySide]) {
    if (char.isHidden) continue;
    const tc = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (tc.chakra <= 3) {
      hideTargets.push(char.instanceId);
    }
  }

  if (hideTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No enemy character with cost 3 or less to hide (upgrade).',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-008-UC' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA_HIDE_ENEMY_COST_3',
    validTargets: hideTargets,
    description: 'Jiraiya (008): Select an enemy character with cost 3 or less in this mission to hide (upgrade effect).',
    descriptionKey: 'game.effect.desc.jiraiya008HideEnemy',
  };
}

export function registerJiraiya008Handlers(): void {
  registerEffect('KS-008-UC', 'MAIN', handleJiraiya008Main);
  registerEffect('KS-008-UC', 'UPGRADE', handleJiraiya008Upgrade);
}
