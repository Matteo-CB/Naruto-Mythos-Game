import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 010/130 - NARUTO UZUMAKI "Permutation" (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 7, Jutsu
 *
 * AMBUSH: Move this character from this mission.
 *   - When revealed from hidden, this character can be moved to another mission.
 *   - Find other missions where the source player doesn't already have a character
 *     with the same name. If multiple options, require target selection.
 *   - Move self to the chosen mission.
 */
function handleNaruto010Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find valid destination missions (not the current mission, no same-name conflict)
  const validTargets: string[] = [];
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    if (mIdx === sourceMissionIndex) continue;

    const mission = state.activeMissions[mIdx];
    const friendlyChars = mission[friendlySide];

    const hasSameName = friendlyChars.some(c => {
      if (c.instanceId === sourceCard.instanceId) return false;
      const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.name_fr === charName;
    });

    if (!hasSameName) {
      validTargets.push(`mission_${mIdx}`);
    }
  }

  // If no valid destination, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Naruto Uzumaki (010): No valid mission to move to.',
      'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: '010/130' }) } };
  }

  // If exactly one valid destination, auto-move
  if (validTargets.length === 1) {
    const destMissionIdx = parseInt(validTargets[0].replace('mission_', ''), 10);
    const newState = moveCharacterToMission(state, sourceCard.instanceId, sourceMissionIndex, destMissionIdx, sourcePlayer);
    return { state: newState };
  }

  // Multiple valid destinations: requires target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO_MOVE_SELF',
    validTargets,
    description: 'Select a mission to move Naruto Uzumaki to.',
  };
}

function moveCharacterToMission(
  state: import('../../EffectTypes').EffectContext['state'],
  charInstanceId: string,
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const newState = { ...state };
  const missions = [...state.activeMissions];
  const fromMission = { ...missions[fromMissionIdx] };
  const toMission = { ...missions[toMissionIdx] };

  const fromChars = [...fromMission[friendlySide]];
  const toChars = [...toMission[friendlySide]];

  // Find and remove character from source mission
  const charIdx = fromChars.findIndex(c => c.instanceId === charInstanceId);
  if (charIdx === -1) return state;

  const movedChar = { ...fromChars[charIdx], missionIndex: toMissionIdx };
  fromChars.splice(charIdx, 1);
  toChars.push(movedChar);

  fromMission[friendlySide] = fromChars;
  toMission[friendlySide] = toChars;
  missions[fromMissionIdx] = fromMission;
  missions[toMissionIdx] = toMission;

  newState.activeMissions = missions;
  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_MOVE',
    `Naruto Uzumaki (010): Moved self from mission ${fromMissionIdx + 1} to mission ${toMissionIdx + 1} (ambush).`,
    'game.log.effect.moveSelf',
    { card: 'NARUTO UZUMAKI', id: '010/130', from: String(fromMissionIdx + 1), to: String(toMissionIdx + 1) },
  );

  return newState;
}

export function registerHandler(): void {
  registerEffect('010/130', 'AMBUSH', handleNaruto010Ambush);
}
