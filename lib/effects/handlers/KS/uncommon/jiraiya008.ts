import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

function handleJiraiya008Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const costReduction = 2;

  // Pre-check: any affordable summons?
  const handTargets = findAffordableSummonsInHand(state, sourcePlayer, costReduction);
  const hiddenTargets = findHiddenSummonsOnBoard(state, sourcePlayer, costReduction);

  if (handTargets.length === 0 && hiddenTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No affordable Summon characters available.',
      'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-008-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA008_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.jiraiya008ConfirmMain',
  };
}

function handleJiraiya008Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const upgradeMission = state.activeMissions[sourceMissionIndex];
  if (!upgradeMission) return { state };

  // Pre-check: any enemy with cost 3 or less?
  let hasTarget = false;
  for (const char of upgradeMission[enemySide]) {
    if (char.isHidden) continue;
    const tc = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (tc.chakra <= 3) {
      hasTarget = true;
      break;
    }
  }

  if (!hasTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No enemy character with cost 3 or less to hide (upgrade).',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-008-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA008_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.jiraiya008ConfirmUpgrade',
  };
}

export function registerJiraiya008Handlers(): void {
  registerEffect('KS-008-UC', 'MAIN', handleJiraiya008Main);
  registerEffect('KS-008-UC', 'UPGRADE', handleJiraiya008Upgrade);
}
