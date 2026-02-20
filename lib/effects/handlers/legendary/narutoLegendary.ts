import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card L01 - NARUTO UZUMAKI (Legendary)
 * Chakra: 6, Power: 6
 * Group: Leaf Village, Keywords: Team 7, Jutsu
 *
 * MAIN: Hide an enemy character with Power 5 or less in this mission
 *       AND another enemy character with Power 2 or less in play (any mission).
 *
 * UPGRADE: MAIN effect: Instead, defeat both of them.
 *
 * Same effect as 133/130 Secret Naruto but on a different card.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function narutoLegendaryMainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const useDefeat = ctx.isUpgrade;

  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Target 1: enemy with Power <= 5 in THIS mission
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const target1 = thisMission[enemySideKey].find((c) => !c.isHidden && getEffectivePower(c) <= 5);

  // Target 2: another enemy with Power <= 2 in any mission
  let target2: CharacterInPlay | undefined;
  let target2MissionIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySideKey]) {
      if (char.isHidden) continue;
      if (target1 && char.instanceId === target1.instanceId) continue;
      if (getEffectivePower(char) <= 2) {
        target2 = char;
        target2MissionIndex = i;
        break;
      }
    }
    if (target2) break;
  }

  // Apply to target 1
  if (target1) {
    if (useDefeat) {
      state = defeatEnemyCharacter(state, ctx.sourceMissionIndex, target1.instanceId, ctx.sourcePlayer);
      state = { ...state, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_DEFEAT',
        `Naruto Uzumaki (Legendary): Defeated enemy ${target1.card.name_fr} in this mission (upgrade).`,
        'game.log.effect.defeat',
        { card: 'NARUTO UZUMAKI', id: 'L01', target: target1.card.name_fr }) };
    } else {
      const missions = [...state.activeMissions];
      const mission = { ...missions[ctx.sourceMissionIndex] };
      const enemyChars = [...mission[enemySideKey]];
      const idx = enemyChars.findIndex((c) => c.instanceId === target1.instanceId);
      if (idx !== -1) {
        enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
        mission[enemySideKey] = enemyChars;
        missions[ctx.sourceMissionIndex] = mission;
        state = { ...state, activeMissions: missions, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_HIDE',
          `Naruto Uzumaki (Legendary): Hid enemy ${target1.card.name_fr} in this mission.`,
          'game.log.effect.hide',
          { card: 'NARUTO UZUMAKI', id: 'L01', target: target1.card.name_fr, mission: `mission ${ctx.sourceMissionIndex}` }) };
      }
    }
  } else {
    state = { ...state, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_NO_TARGET',
      'Naruto Uzumaki (Legendary): No valid enemy with Power 5 or less in this mission.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'L01' }) };
  }

  // Apply to target 2
  if (target2 && target2MissionIndex >= 0) {
    if (useDefeat) {
      state = defeatEnemyCharacter(state, target2MissionIndex, target2.instanceId, ctx.sourcePlayer);
      state = { ...state, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_DEFEAT',
        `Naruto Uzumaki (Legendary): Defeated enemy ${target2.card.name_fr} in mission ${target2MissionIndex} (upgrade).`,
        'game.log.effect.defeat',
        { card: 'NARUTO UZUMAKI', id: 'L01', target: target2.card.name_fr }) };
    } else {
      const missions = [...state.activeMissions];
      const mission = { ...missions[target2MissionIndex] };
      const enemyChars = [...mission[enemySideKey]];
      const idx = enemyChars.findIndex((c) => c.instanceId === target2.instanceId);
      if (idx !== -1) {
        enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
        mission[enemySideKey] = enemyChars;
        missions[target2MissionIndex] = mission;
        state = { ...state, activeMissions: missions, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_HIDE',
          `Naruto Uzumaki (Legendary): Hid enemy ${target2.card.name_fr} in mission ${target2MissionIndex}.`,
          'game.log.effect.hide',
          { card: 'NARUTO UZUMAKI', id: 'L01', target: target2.card.name_fr, mission: `mission ${target2MissionIndex}` }) };
      }
    }
  } else {
    state = { ...state, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_NO_TARGET',
      'Naruto Uzumaki (Legendary): No valid second enemy with Power 2 or less in play.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'L01' }) };
  }

  return { state };
}

export function registerNarutoLegendaryHandlers(): void {
  registerEffect('Legendary', 'MAIN', narutoLegendaryMainHandler);
}
