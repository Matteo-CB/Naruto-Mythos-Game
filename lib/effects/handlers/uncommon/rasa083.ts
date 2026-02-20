import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 083/130 - RASA "Quatrieme Kazekage" (UC)
 * Chakra: 3 | Power: 3
 * Group: Sand Village
 *
 * SCORE [arrow]: Gain 1 Mission point if there's another friendly Sand Village character
 * in this mission.
 *   - Triggered when the player wins the mission where Rasa is assigned.
 *   - Checks if there is at least one OTHER friendly Sand Village character
 *     (not Rasa himself) in the same mission.
 *   - If yes, adds 1 to the player's missionPoints total.
 */

function handleRasa083Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];

  // Check for another Sand Village character in this mission (not self, not hidden for group check)
  const hasOtherSandVillage = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.group === 'Sand Village';
  });

  if (!hasOtherSandVillage) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'SCORE_NO_TARGET',
      'Rasa (083): No other friendly Sand Village character in this mission. No bonus point.',
      'game.log.effect.noTarget',
      { card: 'RASA', id: '083/130' },
    );
    return { state: { ...state, log } };
  }

  // Grant 1 bonus mission point
  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  ps.missionPoints = ps.missionPoints + 1;
  newState[sourcePlayer] = ps;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'SCORE_BONUS_POINT',
    'Rasa (083): Another Sand Village character present - gained 1 bonus Mission point.',
    'game.log.score.bonusPoint',
    { card: 'RASA', id: '083/130', amount: 1 },
  );
  newState.log = log;

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('083/130', 'SCORE', handleRasa083Score);
}
