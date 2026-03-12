import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

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
 *   Stage 1: NARUTO133_CHOOSE_TARGET1 - pick enemy Power ≤ 5 in this mission
 *   Stage 2: NARUTO133_CHOOSE_TARGET2 - pick enemy Power ≤ 2 in any mission
 */

function naruto133MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const useDefeat = ctx.isUpgrade;
  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';

  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Target 1: enemy with Power <= 5 in THIS mission (hidden chars have 0 power → valid)
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const validTarget1 = thisMission[enemySideKey]
    .filter((c) => getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c) => c.instanceId);

  // Target 2: enemy with Power <= 2 in ANY mission
  const validTarget2: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySideKey]) {
      if (getEffectivePower(state, char, opponentPlayer) <= 2) {
        validTarget2.push(char.instanceId);
      }
    }
  }

  if (validTarget1.length === 0 && validTarget2.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (133): No valid enemy targets in play.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-133-S' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup instead of direct target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO133_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: ctx.sourceMissionIndex, useDefeat }),
    descriptionKey: useDefeat
      ? 'game.effect.desc.naruto133ConfirmMainUpgrade'
      : 'game.effect.desc.naruto133ConfirmMain',
  };
}

/** When no target1 exists, check if target2 is available */
export function checkTarget2Only(ctx: EffectContext, state: EffectContext['state'], useDefeat: boolean): EffectResult {
  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTarget2: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySideKey]) {
      if (getEffectivePower(state, char, opponentPlayer) <= 2) {
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
  registerEffect('KS-133-MV', 'MAIN', naruto133MainHandler);
  registerEffect('KS-133_2-MV', 'MAIN', naruto133MainHandler);
}
