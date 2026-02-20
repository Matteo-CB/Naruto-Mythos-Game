import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 139/130 - GAARA "Le Tombeau du Desert" (S)
 * Chakra: 5, Power: 4
 * Group: Sand Village, Keywords: Team Baki, Jutsu
 *
 * MAIN: Defeat an enemy character with a cost less than the number of
 *       friendly hidden characters in play.
 *   - Count ALL friendly hidden characters across ALL missions.
 *   - Find visible enemy characters with cost STRICTLY LESS than that count.
 *   - If multiple valid targets, return requiresTargetSelection.
 *   - If exactly 1, auto-apply defeat.
 *   - If zero hidden chars or no valid targets, fizzle.
 *
 * UPGRADE: In addition, hide one other enemy character with the same name
 *          as the defeated character AND cost strictly less than the defeated
 *          character's cost.
 *   - Only triggers when ctx.isUpgrade is true AND a character was defeated.
 */

function gaara139MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Count all friendly hidden characters across all missions
  let hiddenCount = 0;
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) {
        hiddenCount++;
      }
    }
  }

  if (hiddenCount === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Gaara (139): No friendly hidden characters in play, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'GAARA', id: '139/130' },
    );
    return { state: { ...state, log } };
  }

  // Find all visible enemy characters with cost strictly less than hiddenCount
  const validTargets: { char: CharacterInPlay; missionIndex: number }[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySide]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.chakra < hiddenCount) {
        validTargets.push({ char, missionIndex: i });
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      `Gaara (139): No enemy character with cost less than ${hiddenCount} (hidden count).`,
      'game.log.effect.noTarget',
      { card: 'GAARA', id: '139/130' },
    );
    return { state: { ...state, log } };
  }

  if (validTargets.length > 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'DEFEAT_ENEMY_BY_COST',
      validTargets: validTargets.map((t) => t.char.instanceId),
      description: `Gaara (139): Select an enemy character with cost less than ${hiddenCount} to defeat.`,
    };
  }

  // Exactly 1 valid target: auto-apply
  const target = validTargets[0];
  const defeatedName = target.char.card.name_fr;
  const defeatedCost = (target.char.stack.length > 0
    ? target.char.stack[target.char.stack.length - 1]
    : target.char.card
  ).chakra;

  state = defeatEnemyCharacter(state, target.missionIndex, target.char.instanceId, ctx.sourcePlayer);

  state = {
    ...state,
    log: logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_DEFEAT',
      `Gaara (139): Defeated enemy ${defeatedName} (cost ${defeatedCost}, hidden count ${hiddenCount}).`,
      'game.log.effect.defeat',
      { card: 'GAARA', id: '139/130', target: defeatedName },
    ),
  };

  // UPGRADE addition: hide another enemy character with same name and lower cost
  if (ctx.isUpgrade) {
    let hideTarget: CharacterInPlay | null = null;
    let hideMissionIndex = -1;

    for (let i = 0; i < state.activeMissions.length; i++) {
      for (const char of state.activeMissions[i][enemySide]) {
        if (char.isHidden) continue;
        if (char.instanceId === target.char.instanceId) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.name_fr === defeatedName && topCard.chakra < defeatedCost) {
          hideTarget = char;
          hideMissionIndex = i;
          break;
        }
      }
      if (hideTarget) break;
    }

    if (hideTarget && hideMissionIndex !== -1) {
      const missions = [...state.activeMissions];
      const mission = { ...missions[hideMissionIndex] };
      const enemyChars = [...mission[enemySide]];
      const idx = enemyChars.findIndex((c) => c.instanceId === hideTarget!.instanceId);

      if (idx !== -1) {
        enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
        mission[enemySide] = enemyChars;
        missions[hideMissionIndex] = mission;

        state = {
          ...state,
          activeMissions: missions,
          log: logAction(
            state.log,
            state.turn,
            state.phase,
            ctx.sourcePlayer,
            'EFFECT_HIDE',
            `Gaara (139): Hid enemy ${hideTarget.card.name_fr} in mission ${hideMissionIndex} (upgrade, same name, lower cost).`,
            'game.log.effect.hide',
            { card: 'GAARA', id: '139/130', target: hideTarget.card.name_fr, mission: `mission ${hideMissionIndex}` },
          ),
        };
      }
    } else {
      state = {
        ...state,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          `Gaara (139): No other enemy ${defeatedName} with lower cost to hide (upgrade).`,
          'game.log.effect.noTarget',
          { card: 'GAARA', id: '139/130' },
        ),
      };
    }
  }

  return { state };
}

function gaara139UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerGaara139Handlers(): void {
  registerEffect('139/130', 'MAIN', gaara139MainHandler);
  registerEffect('139/130', 'UPGRADE', gaara139UpgradeHandler);
}
