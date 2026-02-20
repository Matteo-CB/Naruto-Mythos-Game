import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 121/130 - TEMARI (R)
 * Chakra: 4, Power: 3
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Move any friendly character in play to another mission.
 *   Find friendly characters (not self) in play. Target selection for who and where.
 *
 * UPGRADE: Move any character in play (any player) to another mission.
 *   When isUpgrade: expand to include enemy characters as well.
 */

function temari121MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    // Always include friendly characters (not self)
    for (const char of mission[friendlySide]) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }

    // UPGRADE: also include enemy characters
    if (isUpgrade) {
      for (const char of mission[enemySide]) {
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
          isUpgrade
            ? 'Temari (121) UPGRADE: No characters in play to move.'
            : 'Temari (121): No friendly characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'TEMARI', id: '121/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: isUpgrade ? 'TEMARI121_MOVE_ANY' : 'TEMARI121_MOVE_FRIENDLY',
    validTargets,
    description: isUpgrade
      ? 'Temari (121) UPGRADE: Choose any character in play to move to another mission.'
      : 'Temari (121): Choose a friendly character in play to move to another mission.',
  };
}

function temari121UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerTemari121Handlers(): void {
  registerEffect('121/130', 'MAIN', temari121MainHandler);
  registerEffect('121/130', 'UPGRADE', temari121UpgradeHandler);
}
