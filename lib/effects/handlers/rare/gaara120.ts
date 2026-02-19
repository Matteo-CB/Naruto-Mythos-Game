import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 120/130 - GAARA (R)
 * Also applies to 120/130 A (Rare Art variant - same effects, handled by registry normalization)
 * Chakra: 4, Power: 4
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Defeat up to 1 enemy character with Power 1 or less in every mission.
 * UPGRADE: POWERUP X, where X is the number of characters defeated by the MAIN effect.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function gaara120MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  let defeatedCount = 0;

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];
    const target = enemyChars.find((c) => !c.isHidden && getEffectivePower(c) <= 1);

    if (target) {
      state = defeatEnemyCharacter(state, i, target.instanceId, ctx.sourcePlayer);
      defeatedCount++;

      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Gaara (120): Defeated enemy ${target.card.name_fr} (Power ${getEffectivePower(target)}) in mission ${i}.`,
          'game.log.effect.defeat',
          { card: 'GAARA', id: '120/130', target: target.card.name_fr },
        ),
      };
    }
  }

  if (defeatedCount === 0) {
    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Gaara (120): No enemy characters with Power 1 or less found in any mission.',
        'game.log.effect.noTarget',
        { card: 'GAARA', id: '120/130' },
      ),
    };
  }

  if (ctx.isUpgrade && defeatedCount > 0) {
    const missions = [...state.activeMissions];
    const mission = { ...missions[ctx.sourceMissionIndex] };
    const friendlySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlyChars = [...mission[friendlySide]];
    const selfIndex = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

    if (selfIndex !== -1) {
      friendlyChars[selfIndex] = {
        ...friendlyChars[selfIndex],
        powerTokens: friendlyChars[selfIndex].powerTokens + defeatedCount,
      };
      mission[friendlySide] = friendlyChars;
      missions[ctx.sourceMissionIndex] = mission;

      state = {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_POWERUP',
          `Gaara (120): POWERUP ${defeatedCount} (upgrade, X = characters defeated by MAIN).`,
          'game.log.effect.powerupSelf',
          { card: 'GAARA', id: '120/130', amount: defeatedCount },
        ),
      };
    }
  }

  return { state };
}

function gaara120UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerGaara120Handlers(): void {
  registerEffect('120/130', 'MAIN', gaara120MainHandler);
  registerEffect('120/130', 'UPGRADE', gaara120UpgradeHandler);
}
