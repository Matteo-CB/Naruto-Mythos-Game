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

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA132_CHOOSE_SUMMON',
    validTargets: allTargets,
    description: JSON.stringify({
      text: 'Jiraya (132): Choose a Summon character to play (paying 5 less).',
      hiddenChars: hiddenTargets,
      costReduction,
    }),
    descriptionKey: 'game.effect.desc.jiraiya132ChooseSummon',
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

  if (enemyChars.length > 2) {
    // Opponent must choose which to defeat (one at a time)
    const validTargets = enemyChars.map((c) => c.instanceId);

    // Track forced resolver so the turn goes to the opponent after resolution
    state.pendingForcedResolver = opponent;

    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT',
      validTargets,
      selectingPlayer: opponent,
      description: JSON.stringify({
        missionIndex,
        sourcePlayer: ctx.sourcePlayer,
        text: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${missionIndex + 1} (${enemyChars.length} > 2).`,
      }),
      descriptionKey: 'game.effect.desc.jiraiya132OpponentChooseDefeat',
      descriptionParams: { mission: String(missionIndex + 1), count: String(enemyChars.length) },
    };
  }

  // Already <= 2 enemy characters in this mission
  return { state };
}

export function registerJiraiya132Handlers(): void {
  registerEffect('KS-132-S', 'MAIN', jiraiya132MainHandler);
  registerEffect('KS-132-S', 'UPGRADE', jiraiya132UpgradeHandler);
}
