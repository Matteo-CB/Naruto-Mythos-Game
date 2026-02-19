import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 019/130 - INO YAMANAKA (Common)
 * Chakra: 1 | Power: 1
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: If there's another Team 10 character in this mission, POWERUP 1.
 *
 * Checks if there is at least one other friendly non-hidden Team 10 character in the same
 * mission. If so, adds 1 power token to this character (self).
 */
function handleIno019Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Check for another Team 10 character in this mission (not self, not hidden)
  const hasOtherTeam10 = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Team 10');
  });

  if (!hasOtherTeam10) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Ino Yamanaka (019): No other Team 10 character in this mission.',
      'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: '019/130' }) } };
  }

  // POWERUP 1 on self
  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((m, idx) => {
    if (idx !== sourceMissionIndex) return m;
    return {
      ...m,
      player1Characters: m.player1Characters.map((char) =>
        char.instanceId === sourceCard.instanceId
          ? { ...char, powerTokens: char.powerTokens + 1 }
          : char,
      ),
      player2Characters: m.player2Characters.map((char) =>
        char.instanceId === sourceCard.instanceId
          ? { ...char, powerTokens: char.powerTokens + 1 }
          : char,
      ),
    };
  });

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_POWERUP',
    `Ino Yamanaka (019): POWERUP 1 (Team 10 synergy).`,
    'game.log.effect.powerupSelf',
    { card: 'Ino Yamanaka', id: '019/130', amount: 1 },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('019/130', 'MAIN', handleIno019Main);
}
