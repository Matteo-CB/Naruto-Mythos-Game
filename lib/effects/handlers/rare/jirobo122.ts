import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 122/130 - JIROBO (R)
 * Chakra: 4, Power: 3
 * Group: Sound Village, Keywords: Sound Four
 *
 * MAIN: POWERUP X where X = total number of characters (both players) in this mission.
 *   Count all characters (both sides, including hidden) in this mission.
 *   POWERUP that amount on self.
 *
 * UPGRADE: Defeat an enemy with Power 1 or less in this mission.
 *   When isUpgrade: find non-hidden enemies with effective power <= 1. Target selection. Defeat.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function jirobo122MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Count total characters in this mission (both sides, including hidden)
  const totalChars = mission.player1Characters.length + mission.player2Characters.length;

  if (totalChars === 0) {
    // Should not happen since at least Jirobo himself is there
    return { state };
  }

  // POWERUP X on self where X = total characters
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const missions = [...state.activeMissions];
  const m = { ...missions[sourceMissionIndex] };
  const chars = [...m[friendlySide]];
  const selfIdx = chars.findIndex((c) => c.instanceId === sourceCard.instanceId);

  if (selfIdx === -1) return { state };

  chars[selfIdx] = {
    ...chars[selfIdx],
    powerTokens: chars[selfIdx].powerTokens + totalChars,
  };
  m[friendlySide] = chars;
  missions[sourceMissionIndex] = m;

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_POWERUP',
        `Jirobo (122): POWERUP ${totalChars} (total characters in this mission).`,
        'game.log.effect.powerupSelf',
        { card: 'JIROBO', id: '122/130', amount: totalChars },
      ),
    },
  };
}

function jirobo122UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 1
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(c) <= 1)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Jirobo (122) UPGRADE: No enemy with Power 1 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'JIROBO', id: '122/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    const targetChar = enemyChars.find((c: CharacterInPlay) => c.instanceId === validTargets[0]);
    const targetName = targetChar ? targetChar.card.name_fr : 'Unknown';
    let newState = defeatEnemyCharacter(state, sourceMissionIndex, validTargets[0], sourcePlayer);
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_DEFEAT',
        `Jirobo (122) UPGRADE: Defeated ${targetName} (Power ${targetChar ? getEffectivePower(targetChar) : 0}).`,
        'game.log.effect.defeat',
        { card: 'JIROBO', id: '122/130', target: targetName },
      ),
    };
    return { state: newState };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO122_DEFEAT_TARGET',
    validTargets,
    description: 'Jirobo (122) UPGRADE: Choose an enemy character with Power 1 or less to defeat.',
  };
}

export function registerJirobo122Handlers(): void {
  registerEffect('122/130', 'MAIN', jirobo122MainHandler);
  registerEffect('122/130', 'UPGRADE', jirobo122UpgradeHandler);
}
