import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 128/130 - ITACHI UCHIWA (R)
 * Chakra: 5, Power: 5
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * UPGRADE: Move a friendly character in play to another mission.
 *   When isUpgrade: find friendly characters (not self). Target selection for who and where.
 *
 * MAIN [continuous]: Every enemy character in this mission has -1 Power.
 *   This is a continuous power modifier handled by the engine's PowerCalculation.
 *   The handler here is a no-op.
 */

function itachi128MainHandler(ctx: EffectContext): EffectResult {
  // Continuous power modifier: every enemy in this mission has -1 Power.
  // Handled by the engine's PowerCalculation.
  return { state: ctx.state };
}

function itachi128UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find friendly characters (not self) across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
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
          'Itachi Uchiwa (128) UPGRADE: No other friendly characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'ITACHI UCHIWA', id: '128/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI128_MOVE_FRIENDLY',
    validTargets,
    description: 'Itachi Uchiwa (128) UPGRADE: Choose a friendly character in play to move to another mission.',
  };
}

export function registerItachi128Handlers(): void {
  registerEffect('128/130', 'MAIN', itachi128MainHandler);
  registerEffect('128/130', 'UPGRADE', itachi128UpgradeHandler);
}
