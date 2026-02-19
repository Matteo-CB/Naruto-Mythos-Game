import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 01 - "Appel de soutien" / "Call for Support"
 *
 * SCORE [arrow]: POWERUP 2 a character in play.
 *   - When the winning player scores this mission, they add 2 power tokens
 *     to any friendly character currently in play.
 *   - For automated play: pick the first friendly non-hidden character found.
 */

function mss01ScoreHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find first friendly character in any mission (hidden characters are valid POWERUP targets per rules)
  // Auto-resolve: prefer non-hidden characters first, then hidden
  let targetChar: CharacterInPlay | undefined;
  let targetMissionIndex = -1;
  let targetCharIndex = -1;

  // First pass: try non-hidden characters
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const chars = mission[friendlySide];
    for (let j = 0; j < chars.length; j++) {
      if (!chars[j].isHidden) {
        targetChar = chars[j];
        targetMissionIndex = i;
        targetCharIndex = j;
        break;
      }
    }
    if (targetChar) break;
  }

  // Second pass: if no non-hidden found, try hidden characters
  if (!targetChar) {
    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      const chars = mission[friendlySide];
      for (let j = 0; j < chars.length; j++) {
        targetChar = chars[j];
        targetMissionIndex = i;
        targetCharIndex = j;
        break;
      }
      if (targetChar) break;
    }
  }

  if (!targetChar || targetMissionIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 01 (Call for Support): No friendly character in play to receive POWERUP 2.',
      'game.log.effect.noTarget',
      { card: 'Appel de soutien', id: 'MSS 01' },
    );
    return { state: { ...state, log } };
  }

  // Apply POWERUP 2
  const missions = [...state.activeMissions];
  const mission = { ...missions[targetMissionIndex] };
  const chars = [...mission[friendlySide]];
  chars[targetCharIndex] = {
    ...chars[targetCharIndex],
    powerTokens: chars[targetCharIndex].powerTokens + 2,
  };
  mission[friendlySide] = chars;
  missions[targetMissionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'SCORE_POWERUP',
    `MSS 01 (Call for Support): POWERUP 2 on ${targetChar.card.name_fr} in mission ${targetMissionIndex}.`,
    'game.log.score.powerup',
    { card: 'Appel de soutien', amount: 2, target: targetChar.card.name_fr },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerMss01Handlers(): void {
  registerEffect('MSS 01', 'SCORE', mss01ScoreHandler);
}
