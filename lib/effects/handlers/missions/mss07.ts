import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 07 - "Je dois partir" / "I Have to Go"
 *
 * SCORE [arrow]: Move a friendly hidden character in play.
 *   - The scoring player may move one of their hidden characters from any mission
 *     to a different mission.
 *   - If multiple hidden characters, requires character selection.
 *   - If multiple destination missions, requires mission selection (two-stage).
 *   - Auto-resolves when only 1 character and 1 destination.
 */

function mss07ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Collect all hidden friendly characters across all missions
  const validTargets: string[] = [];
  const charMissionMap: Record<string, number> = {};

  for (let i = 0; i < state.activeMissions.length; i++) {
    const chars = state.activeMissions[i][friendlySide];
    for (const c of chars) {
      if (c.isHidden) {
        // Check that there is at least one OTHER mission to move to
        const hasOtherMission = state.activeMissions.length > 1;
        if (hasOtherMission) {
          validTargets.push(c.instanceId);
          charMissionMap[c.instanceId] = i;
        }
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 07 (I Have to Go): No hidden friendly character to move.',
      'game.log.effect.noTarget',
      { card: 'Je dois partir', id: 'MSS 07' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one hidden friendly character, auto-resolve character selection
  if (validTargets.length === 1) {
    const charId = validTargets[0];
    const fromMissionIndex = charMissionMap[charId];

    // Check how many other missions are available
    const otherMissions: string[] = [];
    for (let i = 0; i < state.activeMissions.length; i++) {
      if (i !== fromMissionIndex) {
        otherMissions.push(String(i));
      }
    }

    if (otherMissions.length === 1) {
      // Only one character and one destination: fully auto-resolve
      return applyMss07Move(state, charId, fromMissionIndex, Number(otherMissions[0]), ctx.sourcePlayer, friendlySide);
    }

    // One character but multiple destination missions: need mission selection
    // Encode the character ID in the description for use by the resolution handler
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'MSS07_CHOOSE_DESTINATION',
      validTargets: otherMissions,
      description: JSON.stringify({ text: 'MSS 07 (I Have to Go): Choose a mission to move the hidden character to.', charId, fromMissionIndex }),
    };
  }

  // Multiple hidden friendly characters: require player to choose which one to move
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS07_MOVE_HIDDEN',
    validTargets,
    description: 'MSS 07 (I Have to Go): Choose a hidden friendly character to move.',
  };
}

function applyMss07Move(
  state: import('../../EffectTypes').EffectContext['state'],
  charInstanceId: string,
  fromMissionIndex: number,
  toMissionIndex: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
): EffectResult {
  const mission = state.activeMissions[fromMissionIndex];
  const chars = mission[friendlySide];
  const charIndex = chars.findIndex((c) => c.instanceId === charInstanceId);

  if (charIndex === -1) {
    return { state };
  }

  const targetChar = chars[charIndex];

  // Remove from source mission
  const missions = [...state.activeMissions];
  const sourceMission = { ...missions[fromMissionIndex] };
  const sourceChars = [...sourceMission[friendlySide]];
  sourceChars.splice(charIndex, 1);
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
    sourcePlayer,
    'SCORE_MOVE',
    `MSS 07 (I Have to Go): Moved hidden ${targetChar.card.name_fr} from mission ${fromMissionIndex} to mission ${toMissionIndex}.`,
    'game.log.score.moveHidden',
    { card: 'Je dois partir', target: targetChar.card.name_fr },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerMss07Handlers(): void {
  registerEffect('MSS 07', 'SCORE', mss07ScoreHandler);
}
