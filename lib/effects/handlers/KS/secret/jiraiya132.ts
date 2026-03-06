import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

/**
 * Card 132/130 - JIRAYA (S)
 * Chakra: 7, Power: 6
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Play a Summon character anywhere, paying 5 less.
 *   - Includes Summon cards in hand AND hidden Summon characters on the board.
 *
 * UPGRADE: The opponent must choose characters to be defeated until they
 *   only have up to 2 assigned per mission.
 *   - The OPPONENT selects which of their characters to defeat.
 *   - Processed one mission at a time, one defeat at a time.
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

  // Check each mission for > 2 enemy characters
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];

    if (enemyChars.length > 2) {
      // Opponent must choose which to defeat (one at a time)
      const validTargets = enemyChars.map((c) => c.instanceId);
      return {
        state,
        requiresTargetSelection: true,
        targetSelectionType: 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT',
        validTargets,
        selectingPlayer: opponent,
        description: JSON.stringify({
          missionIndex: i,
          sourcePlayer: ctx.sourcePlayer,
          text: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${i + 1} (${enemyChars.length} > 2).`,
        }),
        descriptionKey: 'game.effect.desc.jiraiya132OpponentChooseDefeat',
        descriptionParams: { mission: String(i + 1), count: String(enemyChars.length) },
      };
    }
  }

  // All missions already have <= 2 enemy characters
  return { state };
}

export function registerJiraiya132Handlers(): void {
  registerEffect('KS-132-S', 'MAIN', jiraiya132MainHandler);
  registerEffect('KS-132-S', 'UPGRADE', jiraiya132UpgradeHandler);
}
