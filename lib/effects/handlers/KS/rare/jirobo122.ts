import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';

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

function jirobo122MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Count total characters in this mission (both sides, including hidden)
  const totalChars = mission.player1Characters.length + mission.player2Characters.length;

  if (totalChars === 0) {
    return { state };
  }

  // CONFIRM popup before applying POWERUP
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO122_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: `Jirobo (122) MAIN: POWERUP ${totalChars} (${totalChars} characters in this mission).`,
    descriptionKey: 'game.effect.desc.jirobo122ConfirmMain',
    descriptionParams: { amount: String(totalChars) },
  };
}

function jirobo122UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find enemies with effective power <= 1 (hidden chars have power 0, valid targets)
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => getEffectivePower(state, c, opponentPlayer) <= 1)
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
          { card: 'JIROBO', id: 'KS-122-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO122_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Jirobo (122) UPGRADE: Defeat an enemy character with Power 1 or less in this mission?',
    descriptionKey: 'game.effect.desc.jirobo122ConfirmUpgrade',
  };
}

export function registerJirobo122Handlers(): void {
  registerEffect('KS-122-R', 'MAIN', jirobo122MainHandler);
  registerEffect('KS-122-R', 'UPGRADE', jirobo122UpgradeHandler);
}
