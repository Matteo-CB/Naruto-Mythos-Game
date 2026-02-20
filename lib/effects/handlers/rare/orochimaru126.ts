import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

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

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function orochimaru126ScoreHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
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
          power: getEffectivePower(char),
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
          { card: 'OROCHIMARU', id: '126/130' },
        ),
      },
    };
  }

  // Find the lowest power value
  const minPower = Math.min(...candidates.map((c) => c.power));
  const weakest = candidates.filter((c) => c.power === minPower);

  // If only one weakest, auto-resolve
  if (weakest.length === 1) {
    const target = weakest[0];
    let newState = defeatEnemyCharacter(state, target.missionIndex, target.char.instanceId, sourcePlayer);
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_DEFEAT',
        `Orochimaru (126) SCORE: Defeated weakest enemy ${target.char.card.name_fr} (Power ${target.power}).`,
        'game.log.effect.defeat',
        { card: 'OROCHIMARU', id: '126/130', target: target.char.card.name_fr },
      ),
    };
    return { state: newState };
  }

  // Multiple tied weakest: requires target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU126_DEFEAT_WEAKEST',
    validTargets: weakest.map((w) => w.char.instanceId),
    description: `Orochimaru (126) SCORE: Multiple enemies tied for weakest (Power ${minPower}). Choose which to defeat.`,
  };
}

function orochimaru126UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  // POWERUP 3 on self
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const chars = [...mission[friendlySide]];
  const selfIdx = chars.findIndex((c) => c.instanceId === sourceCard.instanceId);

  if (selfIdx === -1) return { state };

  chars[selfIdx] = {
    ...chars[selfIdx],
    powerTokens: chars[selfIdx].powerTokens + 3,
  };
  mission[friendlySide] = chars;
  missions[sourceMissionIndex] = mission;

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_POWERUP',
        'Orochimaru (126) UPGRADE: POWERUP 3 on self.',
        'game.log.effect.powerupSelf',
        { card: 'OROCHIMARU', id: '126/130', amount: 3 },
      ),
    },
  };
}

export function registerOrochimaru126Handlers(): void {
  registerEffect('126/130', 'SCORE', orochimaru126ScoreHandler);
  registerEffect('126/130', 'UPGRADE', orochimaru126UpgradeHandler);
}
