import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 153/130 - GAARA (M)
 * Chakra: 5, Power: 5
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Defeat up to 1 enemy character with Power 1 or less in every mission.
 *   - Same logic as Gaara 120/130: iterate all missions, find the weakest
 *     non-hidden enemy with effective power <= 1, defeat one per mission.
 *
 * UPGRADE: POWERUP X where X = number of characters defeated by the MAIN effect.
 *   - When isUpgrade: after defeating, count defeated characters and apply
 *     POWERUP on self with that count.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function gaara153MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  let defeatedCount = 0;

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];

    // Find the weakest non-hidden enemy with power <= 1
    let target: CharacterInPlay | undefined;
    let targetPower = Infinity;

    for (const char of enemyChars) {
      if (char.isHidden) continue;
      const power = getEffectivePower(char);
      if (power <= 1 && power < targetPower) {
        target = char;
        targetPower = power;
      }
    }

    if (target) {
      state = defeatEnemyCharacter(state, i, target.instanceId, ctx.sourcePlayer);
      defeatedCount++;

      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Gaara (153): Defeated enemy ${target.card.name_fr} (Power ${targetPower}) in mission ${i}.`,
          'game.log.effect.defeat',
          { card: 'GAARA', id: '153/130', target: target.card.name_fr },
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
        'Gaara (153): No enemy characters with Power 1 or less found in any mission.',
        'game.log.effect.noTarget',
        { card: 'GAARA', id: '153/130' },
      ),
    };
  }

  // UPGRADE: POWERUP X on self where X = number defeated
  if (ctx.isUpgrade && defeatedCount > 0) {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[ctx.sourceMissionIndex] };
    const friendlyChars = [...mission[friendlySide]];
    const selfIdx = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

    if (selfIdx !== -1) {
      friendlyChars[selfIdx] = {
        ...friendlyChars[selfIdx],
        powerTokens: friendlyChars[selfIdx].powerTokens + defeatedCount,
      };
      mission[friendlySide] = friendlyChars;
      missions[ctx.sourceMissionIndex] = mission;

      state = {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_POWERUP',
          `Gaara (153): POWERUP ${defeatedCount} (upgrade, X = characters defeated by MAIN).`,
          'game.log.effect.powerupSelf',
          { card: 'GAARA', id: '153/130', amount: defeatedCount },
        ),
      };
    }
  }

  return { state };
}

function gaara153UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerGaara153Handlers(): void {
  registerEffect('153/130', 'MAIN', gaara153MainHandler);
  registerEffect('153/130', 'UPGRADE', gaara153UpgradeHandler);
}
