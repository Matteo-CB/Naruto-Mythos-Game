import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 119b/130 - MIGHT GUY (R)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team Guy
 *
 * UPGRADE: POWERUP 3 (self).
 *   When isUpgrade: POWERUP 3 on self.
 *
 * MAIN: Discard a card from hand; if you do, move any number of non-hidden enemies
 *   with total Power <= discarded card's Power to other missions.
 *   Two-stage: first choose which card to discard, then the engine determines
 *   which enemies can be moved (auto-select enemies fitting under the power limit).
 */

function guy119bMainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Might Guy (119b): Hand is empty, cannot discard.',
          'game.log.effect.noTarget',
          { card: 'MIGHT GUY', id: '119b/130' },
        ),
      },
    };
  }

  // Check if there are any non-hidden enemies in play to move
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  let hasEnemyToMove = false;
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (!char.isHidden) {
        hasEnemyToMove = true;
        break;
      }
    }
    if (hasEnemyToMove) break;
  }

  if (!hasEnemyToMove) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Might Guy (119b): No non-hidden enemy characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'MIGHT GUY', id: '119b/130' },
        ),
      },
    };
  }

  // Stage 1: Choose which card to discard from hand
  const handIndices = playerState.hand.map((_: unknown, i: number) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GUY119B_CHOOSE_DISCARD',
    validTargets: handIndices,
    description: 'Might Guy (119b): Choose a card to discard. Non-hidden enemies with total Power <= discarded card\'s Power will be moved.',
  };
}

function guy119bUpgradeHandler(ctx: EffectContext): EffectResult {
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
        'Might Guy (119b) UPGRADE: POWERUP 3 on self.',
        'game.log.effect.powerupSelf',
        { card: 'MIGHT GUY', id: '119b/130', amount: 3 },
      ),
    },
  };
}

export function registerGuy119bHandlers(): void {
  registerEffect('119b/130', 'MAIN', guy119bMainHandler);
  registerEffect('119b/130', 'UPGRADE', guy119bUpgradeHandler);
}
