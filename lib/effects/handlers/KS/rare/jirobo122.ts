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
        { card: 'JIROBO', id: 'KS-122-R', amount: totalChars },
      ),
    },
  };
}

function jirobo122UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 1
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 1)
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
    targetSelectionType: 'JIROBO122_DEFEAT_TARGET',
    validTargets,
    description: 'Jirobo (122) UPGRADE: Choose an enemy character with Power 1 or less to defeat.',
    descriptionKey: 'game.effect.desc.jirobo122Defeat',
  };
}

export function registerJirobo122Handlers(): void {
  registerEffect('KS-122-R', 'MAIN', jirobo122MainHandler);
  registerEffect('KS-122-R', 'UPGRADE', jirobo122UpgradeHandler);
}
