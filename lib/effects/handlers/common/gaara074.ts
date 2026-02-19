import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 074/130 - GAARA (Common, first version)
 * Chakra: 2 | Power: 2
 * Group: Sand Village | Keywords: Team Baki
 * MAIN: POWERUP X where X is the number of friendly hidden characters in this mission.
 *
 * Counts the number of friendly hidden characters in the same mission and adds that many
 * power tokens to this character (self).
 */
function handleGaara074Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Count friendly hidden characters in this mission (not counting self)
  const hiddenCount = friendlyChars.filter(
    (char) => char.isHidden && char.instanceId !== sourceCard.instanceId,
  ).length;

  if (hiddenCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gaara (074): No friendly hidden characters in this mission.',
      'game.log.effect.noTarget', { card: 'GAARA', id: '074/130' }) } };
  }

  // POWERUP X on self
  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((m, idx) => {
    if (idx !== sourceMissionIndex) return m;
    return {
      ...m,
      player1Characters: m.player1Characters.map((char) =>
        char.instanceId === sourceCard.instanceId
          ? { ...char, powerTokens: char.powerTokens + hiddenCount }
          : char,
      ),
      player2Characters: m.player2Characters.map((char) =>
        char.instanceId === sourceCard.instanceId
          ? { ...char, powerTokens: char.powerTokens + hiddenCount }
          : char,
      ),
    };
  });

  const log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_POWERUP',
    `Gaara (074): POWERUP ${hiddenCount} on self.`,
    'game.log.effect.powerupSelf',
    { card: 'Gaara', id: '074/130', amount: String(hiddenCount) },
  );

  return { state: { ...newState, log } };
}

export function registerHandler(): void {
  registerEffect('074/130', 'MAIN', handleGaara074Main);
}
