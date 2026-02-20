import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 038/130 - ROCK LEE "Entrainement au Poing violent" (Common)
 * Chakra: 2 | Power: 3
 * Group: Leaf Village | Keywords: Team Guy
 * AMBUSH: POWERUP 1.
 *
 * When revealed from hidden, adds 1 power token to this character (self).
 * This effect only triggers as AMBUSH (when a hidden character is revealed),
 * never when played directly face-visible.
 */
function handleRockLee038Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  // POWERUP 1 on self
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[friendlySide]];
  const idx = chars.findIndex(c => c.instanceId === sourceCard.instanceId);

  if (idx !== -1) {
    chars[idx] = { ...chars[idx], powerTokens: chars[idx].powerTokens + 1 };
    mission[friendlySide] = chars;
    missions[sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_POWERUP',
      'Rock Lee (038): POWERUP 1 on self (ambush).',
      'game.log.effect.powerupSelf',
      { card: 'ROCK LEE', id: '038/130', amount: 1 },
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

export function registerHandler(): void {
  registerEffect('038/130', 'AMBUSH', handleRockLee038Ambush);
}
