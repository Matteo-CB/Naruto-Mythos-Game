import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 119/130 - KANKURO (R)
 * Chakra: 4, Power: 3
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Defeat an enemy with Power 3 or less in this mission.
 *   Find non-hidden enemies in this mission with effective power <= 3. Target selection. Defeat.
 *
 * UPGRADE: Move any character in play (any player) to another mission.
 *   When isUpgrade: find all characters across all missions. Target selection for who and where.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function kankuro119MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 3
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(c) <= 3)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kankuro (119): No enemy with Power 3 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'KANKURO', id: '119/130' },
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
        `Kankuro (119): Defeated ${targetName} (Power ${targetChar ? getEffectivePower(targetChar) : 0}).`,
        'game.log.effect.defeat',
        { card: 'KANKURO', id: '119/130', target: targetName },
      ),
    };
    return { state: newState };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KANKURO119_DEFEAT_TARGET',
    validTargets,
    description: 'Kankuro (119): Choose an enemy character with Power 3 or less to defeat.',
  };
}

function kankuro119UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all characters in play (any player, any mission)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission.player1Characters) {
      // Don't move self
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
    for (const char of mission.player2Characters) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kankuro (119) UPGRADE: No characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'KANKURO', id: '119/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KANKURO119_MOVE_CHARACTER',
    validTargets,
    description: 'Kankuro (119) UPGRADE: Choose a character in play to move to another mission.',
  };
}

export function registerKankuro119Handlers(): void {
  registerEffect('119/130', 'MAIN', kankuro119MainHandler);
  registerEffect('119/130', 'UPGRADE', kankuro119UpgradeHandler);
}
