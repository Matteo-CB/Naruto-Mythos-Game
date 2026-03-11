import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 126/130 - OROCHIMARU (R)
 * Chakra: 5, Power: 4
 * Group: Sound Village, Keywords: Sannin
 *
 * SCORE: Defeat the weakest (lowest effective power) non-hidden enemy character in play.
 *   Triggers when the player wins the mission where Orochimaru is assigned.
 *   Find all non-hidden enemies across all missions. Pick the one with the lowest
 *   effective power. If tied, target selection.
 *
 * UPGRADE: POWERUP 3 (self).
 *   When isUpgrade: POWERUP 3 on self.
 */

function orochimaru126ScoreHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find all non-hidden enemy characters across all missions
  const candidates: Array<{ char: CharacterInPlay; missionIndex: number; power: number }> = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (!char.isHidden) {
        candidates.push({
          char,
          missionIndex: i,
          power: getEffectivePower(state, char, opponentPlayer),
        });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Orochimaru (126) SCORE: No non-hidden enemy characters in play.',
          'game.log.effect.noTarget',
          { card: 'OROCHIMARU', id: 'KS-126-R' },
        ),
      },
    };
  }

  // CONFIRM popup before executing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU126_CONFIRM_SCORE',
    validTargets: [ctx.sourceCard.instanceId],
    description: 'Orochimaru (126) SCORE: Defeat the weakest enemy character in play.',
    descriptionKey: 'game.effect.desc.orochimaru126ConfirmScore',
    isOptional: true,
  };
}

function orochimaru126UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  // CONFIRM popup before applying POWERUP 3
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU126_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    description: 'Orochimaru (126) UPGRADE: POWERUP 3 (self).',
    descriptionKey: 'game.effect.desc.orochimaru126ConfirmUpgrade',
    isOptional: true,
  };
}

export function registerOrochimaru126Handlers(): void {
  registerEffect('KS-126-R', 'SCORE', orochimaru126ScoreHandler);
  registerEffect('KS-126-R', 'UPGRADE', orochimaru126UpgradeHandler);
}
