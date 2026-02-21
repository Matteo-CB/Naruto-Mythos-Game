import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 121/130 - TEMARI (R)
 * Chakra: 4, Power: 3
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Move any friendly character in play to another mission.
 *   Find friendly characters (not self) in play. Target selection for who and where.
 *
 * UPGRADE: Move any character in play (any player) to another mission.
 *   This is a STANDALONE additional effect (no "MAIN effect:" prefix in JSON).
 *   When upgrading, BOTH MAIN and UPGRADE fire independently:
 *   - MAIN moves a friendly character
 *   - UPGRADE moves any character (friend or foe)
 */

function temari121MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    // MAIN always targets only friendly characters (not self)
    for (const char of mission[friendlySide]) {
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
          'Temari (121) MAIN: No friendly characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'TEMARI', id: '121/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TEMARI121_MOVE_FRIENDLY',
    validTargets,
    description: 'Temari (121) MAIN: Choose a friendly character in play to move to another mission.',
  };
}

function temari121UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE is a standalone additional effect: move any character (friend or foe) in play
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    // Include friendly characters (not self)
    for (const char of mission[friendlySide]) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
    // Include enemy characters
    for (const char of mission[enemySide]) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Temari (121) UPGRADE: No characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'TEMARI', id: '121/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TEMARI121_MOVE_ANY',
    validTargets,
    description: 'Temari (121) UPGRADE: Choose any character in play to move to another mission.',
  };
}

export function registerTemari121Handlers(): void {
  registerEffect('121/130', 'MAIN', temari121MainHandler);
  registerEffect('121/130', 'UPGRADE', temari121UpgradeHandler);
}
