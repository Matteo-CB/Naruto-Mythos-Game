import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 07 - "Je dois partir" / "I Have to Go"
 *
 * SCORE [arrow]: Move a friendly hidden character in play.
 *   - The scoring player may move one of their hidden characters from any mission
 *     to a different mission.
 *   - For automated play: find the first hidden friendly character and move it
 *     to the first different mission.
 */

function mss07ScoreHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find first hidden friendly character in any mission
  let targetChar: CharacterInPlay | undefined;
  let fromMissionIndex = -1;
  let targetCharIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const chars = mission[friendlySide];
    for (let j = 0; j < chars.length; j++) {
      if (chars[j].isHidden) {
        targetChar = chars[j];
        fromMissionIndex = i;
        targetCharIndex = j;
        break;
      }
    }
    if (targetChar) break;
  }

  if (!targetChar || fromMissionIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 07 (I Have to Go): No hidden friendly character to move.',
    );
    return { state: { ...state, log } };
  }

  // Find a different mission to move to
  let toMissionIndex = -1;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== fromMissionIndex) {
      toMissionIndex = i;
      break;
    }
  }

  if (toMissionIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 07 (I Have to Go): No other mission to move to.',
    );
    return { state: { ...state, log } };
  }

  // Remove from source mission
  const missions = [...state.activeMissions];
  const sourceMission = { ...missions[fromMissionIndex] };
  const sourceChars = [...sourceMission[friendlySide]];
  sourceChars.splice(targetCharIndex, 1);
  sourceMission[friendlySide] = sourceChars;
  missions[fromMissionIndex] = sourceMission;

  // Add to target mission
  const targetMission = { ...missions[toMissionIndex] };
  const movedChar = { ...targetChar, missionIndex: toMissionIndex };
  targetMission[friendlySide] = [...targetMission[friendlySide], movedChar];
  missions[toMissionIndex] = targetMission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'SCORE_MOVE',
    `MSS 07 (I Have to Go): Moved hidden ${targetChar.card.name_fr} from mission ${fromMissionIndex} to mission ${toMissionIndex}.`,
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerMss07Handlers(): void {
  registerEffect('MSS 07', 'SCORE', mss07ScoreHandler);
}
