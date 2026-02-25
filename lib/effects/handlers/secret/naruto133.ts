import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { getEffectivePower } from '../../powerUtils';

/**
 * Card 133/130 - NARUTO UZUMAKI "Rasengan" (S)
 * Chakra: 6, Power: 6
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Hide an enemy character with Power 5 or less in this mission
 *       AND another enemy character with Power 2 or less in play (any mission).
 *
 * MAIN "effect:": Instead, defeat both of them (applies on upgrade).
 *
 * Two-stage target selection:
 *   Stage 1: NARUTO133_CHOOSE_TARGET1 — pick enemy Power ≤ 5 in this mission
 *   Stage 2: NARUTO133_CHOOSE_TARGET2 — pick enemy Power ≤ 2 in any mission
 */

function naruto133MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const useDefeat = ctx.isUpgrade;
  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';

  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Target 1: enemy with Power <= 5 in THIS mission
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const validTarget1 = thisMission[enemySideKey]
    .filter((c) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c) => c.instanceId);

  if (validTarget1.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (133): No valid enemy with Power 5 or less in this mission.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-133-S' },
    );
    // Still check for target 2
    return checkTarget2Only(ctx, { ...state, log }, useDefeat);
  }

  // Stage 1: player chooses target 1
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO133_CHOOSE_TARGET1',
    validTargets: validTarget1,
    description: JSON.stringify({
      missionIndex: ctx.sourceMissionIndex,
      useDefeat,
      text: useDefeat
        ? 'Naruto Uzumaki (133): Choose an enemy with Power 5 or less to defeat in this mission.'
        : 'Naruto Uzumaki (133): Choose an enemy with Power 5 or less to hide in this mission.',
    }),
    descriptionKey: useDefeat
      ? 'game.effect.desc.naruto133ChooseDefeat1'
      : 'game.effect.desc.naruto133ChooseHide1',
  };
}

/** When no target1 exists, check if target2 is available */
function checkTarget2Only(ctx: EffectContext, state: EffectContext['state'], useDefeat: boolean): EffectResult {
  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTarget2: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySideKey]) {
      if (!char.isHidden && getEffectivePower(state, char, opponentPlayer) <= 2) {
        validTarget2.push(char.instanceId);
      }
    }
  }

  if (validTarget2.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (133): No valid second enemy with Power 2 or less in play.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-133-S' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO133_CHOOSE_TARGET2',
    validTargets: validTarget2,
    description: JSON.stringify({
      useDefeat,
      target1Id: null,
      text: useDefeat
        ? 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to defeat (any mission).'
        : 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to hide (any mission).',
    }),
    descriptionKey: useDefeat
      ? 'game.effect.desc.naruto133ChooseDefeat2'
      : 'game.effect.desc.naruto133ChooseHide2',
  };
}

export function registerNaruto133Handlers(): void {
  registerEffect('KS-133-S', 'MAIN', naruto133MainHandler);
}
