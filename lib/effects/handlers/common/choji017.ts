import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 017/130 - CHOJI AKIMICHI "Decuplement" (Common)
 * Chakra: 2 | Power: 1
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 * MAIN: POWERUP 3.
 *
 * Adds 3 power tokens to this character (self).
 */
function handleChoji017Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  // POWERUP 3 on self
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[friendlySide]];
  const idx = chars.findIndex(c => c.instanceId === sourceCard.instanceId);

  if (idx !== -1) {
    chars[idx] = { ...chars[idx], powerTokens: chars[idx].powerTokens + 3 };
    mission[friendlySide] = chars;
    missions[sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_POWERUP',
      'Choji Akimichi (017): POWERUP 3 on self.',
      'game.log.effect.powerupSelf',
      { card: 'CHOJI AKIMICHI', id: '017/130', amount: 3 },
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

export function registerHandler(): void {
  registerEffect('017/130', 'MAIN', handleChoji017Main);
}
