import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';

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

function kankuro119MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find enemies with effective power <= 3 (hidden chars have power 0, so they qualify)
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => getEffectivePower(state, c, opponentPlayer) <= 3)
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
          { card: 'KANKURO', id: 'KS-119-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KANKURO119_DEFEAT_TARGET',
    validTargets,
    description: 'Kankuro (119): Choose an enemy character with Power 3 or less to defeat.',
    descriptionKey: 'game.effect.desc.kankuro119Defeat',
  };
}

function kankuro119UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all characters in play (any player, any mission, including self)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
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
          'Kankuro (119) UPGRADE: No characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'KANKURO', id: 'KS-119-R' },
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
    descriptionKey: 'game.effect.desc.kankuro119MoveCharacter',
  };
}

export function registerKankuro119Handlers(): void {
  registerEffect('KS-119-R', 'MAIN', kankuro119MainHandler);
  registerEffect('KS-119-R', 'UPGRADE', kankuro119UpgradeHandler);
}
