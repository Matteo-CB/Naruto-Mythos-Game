import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

/**
 * Card 132/130 - JIRAYA (S)
 * Chakra: 8, Power: 8
 * Group: Leaf Village, Keywords: Sannin, Jutsu
 *
 * MAIN: Play a Summon character anywhere, paying 5 less.
 *   - Includes Summon cards in hand AND hidden Summon characters on the board.
 *
 * UPGRADE: The opponent must choose characters to be defeated until they
 *   only have up to 2 assigned in THIS mission (where Jiraiya is).
 *   - The OPPONENT selects which of their characters to defeat.
 *   - Processed one defeat at a time, only in Jiraiya's mission.
 */

function jiraiya132MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const costReduction = 5;

  const handTargets = findAffordableSummonsInHand(state, sourcePlayer, costReduction);
  const hiddenTargets = findHiddenSummonsOnBoard(state, sourcePlayer, costReduction);

  const allTargets = [
    ...handTargets.map(i => `HAND_${i}`),
    ...hiddenTargets.map(h => `HIDDEN_${h.instanceId}`),
  ];

  if (allTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraya (132): No affordable Summon characters available.',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-132-S' }) } };
  }

  // CONFIRM popup before executing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA132_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: 'Jiraya (132): Play a Summon character anywhere, paying 5 less.',
    descriptionKey: 'game.effect.desc.jiraiya132ConfirmMain',
    isOptional: true,
  };
}

function jiraiya132UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const opponent = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Only check THIS mission (where Jiraiya is), not all missions
  const missionIndex = ctx.sourceMissionIndex;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return { state };

  const enemyChars = mission[enemySide];

  if (enemyChars.length <= 2) {
    // Already <= 2 enemy characters in this mission
    return { state };
  }

  // CONFIRM popup before executing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA132_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ missionIndex, sourcePlayer: ctx.sourcePlayer }),
    descriptionKey: 'game.effect.desc.jiraiya132ConfirmUpgrade',
    isOptional: true,
  };
}

export function registerJiraiya132Handlers(): void {
  registerEffect('KS-132-S', 'MAIN', jiraiya132MainHandler);
  registerEffect('KS-132-S', 'UPGRADE', jiraiya132UpgradeHandler);
}
